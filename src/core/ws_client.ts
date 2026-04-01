// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import type { Config } from './config';
import type { EventHeader, WrappedEventHandler } from './types';
import { USER_AGENT } from './version';
import { DEFAULT_WS_PATH } from './consts';
import type { CryptoManager } from './crypto';
import {
  encodeSecureMessage,
  decodeSecureMessage,
  encodeWebSocketMessage,
  decodeWebSocketMessage,
  encodeHttpRequest,
  decodeHttpResponse,
} from '@/internal/transport';
import type { HttpRequest, HttpResponse, WebSocketMessage } from '@/internal/transport';

// Resolve WebSocket implementation: native (browser / Node 22+) or 'ws' package (Node < 22)
let _WebSocketImpl: typeof WebSocket | undefined;

async function getWebSocket(): Promise<typeof WebSocket> {
  if (_WebSocketImpl) return _WebSocketImpl;
  if (typeof WebSocket !== 'undefined') {
    _WebSocketImpl = WebSocket;
    return _WebSocketImpl;
  }
  try {
    // Dynamic import for Node.js < 22; 'ws' is an optional peer dependency
    const mod = await (Function('return import("ws")')() as Promise<Record<string, unknown>>);
    _WebSocketImpl = (mod.default || mod) as unknown as typeof WebSocket;
    return _WebSocketImpl;
  } catch {
    throw new Error(
      'No WebSocket implementation found. ' +
      'Install the "ws" package: npm install ws',
    );
  }
}

const RECONNECT_CHECK_INTERVAL = 10_000;
const HEALTH_CHECK_INTERVAL = 20_000;
const ALIVE_TIMEOUT = 40_000;
const CONNECT_TIMEOUT = 5_000;
const WRITE_TIMEOUT = 60_000;

interface WsClientOptions {
  config: Config;
  getSecret: () => string;
  getToken: () => Promise<string>;
  ensurePing: () => Promise<void>;
  cryptoManager: CryptoManager;
}

interface ReqCallback {
  resolve: (resp: HttpResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WsClient {
  private config: Config;
  private getSecret: () => string;
  private getToken: () => Promise<string>;
  private ensurePing: () => Promise<void>;
  private cryptoManager: CryptoManager;

  private eventHandlerMap = new Map<string, WrappedEventHandler[]>();
  private socket: WebSocket | null = null;
  private isConnecting = false;
  private isReconnecting = false;
  private shouldClose = false;
  private reqCount = 0;
  private reqCallbacks = new Map<string, ReqCallback>();
  private reconnectAttempt = 0;
  private lastMessageAt = 0;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectCheckTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private initDone = false;
  private initPromise: Promise<void> | null = null;

  constructor(options: WsClientOptions) {
    this.config = options.config;
    this.getSecret = options.getSecret;
    this.getToken = options.getToken;
    this.ensurePing = options.ensurePing;
    this.cryptoManager = options.cryptoManager;
  }

  onEvent(eventType: string, handler: WrappedEventHandler): void {
    this.ensureInit();
    let handlers = this.eventHandlerMap.get(eventType);
    if (!handlers) {
      handlers = [];
      this.eventHandlerMap.set(eventType, handlers);
    }
    handlers.push(handler);
  }

  offEvent(eventType: string, handler: WrappedEventHandler): void {
    const handlers = this.eventHandlerMap.get(eventType);
    if (!handlers) return;
    const idx = handlers.indexOf(handler);
    if (idx >= 0) {
      handlers.splice(idx, 1);
    }
  }

  async httpRequest(req: HttpRequest): Promise<HttpResponse> {
    await this.ensureInit();

    const reqId = String(++this.reqCount);
    req.reqId = reqId;

    return new Promise<HttpResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.reqCallbacks.delete(reqId);
        reject(new Error(`websocket request timeout: ${WRITE_TIMEOUT}ms`));
      }, WRITE_TIMEOUT);

      this.reqCallbacks.set(reqId, { resolve, reject, timer });

      const reqBytes = encodeHttpRequest(req);
      this.sendMessage({
        httpRequest: {
          method: req.method,
          path: req.path,
          headers: req.headers,
          body: req.body,
          reqId,
        },
      }).catch((err) => {
        clearTimeout(timer);
        this.reqCallbacks.delete(reqId);
        reject(err);
      });
    });
  }

  close(): void {
    this.shouldClose = true;
    this.clearTimers();
    if (this.socket) {
      try {
        this.socket.close(1000, 'client close');
      } catch {
        // ignore
      }
      this.socket = null;
    }
    // Reject all pending callbacks
    for (const [, cb] of this.reqCallbacks) {
      clearTimeout(cb.timer);
      cb.reject(new Error('websocket closed'));
    }
    this.reqCallbacks.clear();
  }

  // --- Internal ---

  private ensureInit(): void {
    if (this.initDone) return;
    if (!this.initPromise) {
      this.initPromise = this.doInit();
    }
  }

  private async doInit(): Promise<void> {
    if (this.initDone) return;
    try {
      await this.ensurePing();
      await this.connect();
      this.initDone = true;
    } catch (err) {
      this.config.logger.error('ws init failed', err);
      this.reconnect();
    }
  }

  private async connect(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      // Close existing socket
      if (this.socket) {
        try { this.socket.close(); } catch { /* ignore */ }
        this.socket = null;
      }

      // Reject pending callbacks
      for (const [, cb] of this.reqCallbacks) {
        clearTimeout(cb.timer);
        cb.reject(new Error('websocket reconnecting'));
      }
      this.reqCallbacks.clear();

      await this.ensurePing();
      const token = await this.getToken();

      // Build WS URL
      let wsUrl = this.config.backendUrl.replace(/^http/, 'ws') + DEFAULT_WS_PATH + `?token=${encodeURIComponent(token)}`;

      const WS = await getWebSocket();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('websocket connect timeout'));
        }, CONNECT_TIMEOUT);

        const ws = new WS(wsUrl);
        ws.binaryType = 'arraybuffer';

        ws.onopen = async () => {
          clearTimeout(timer);
          this.socket = ws;

          try {
            // Send InitRequest
            await this.sendMessage({ initRequest: { userAgent: USER_AGENT } });

            // Wait for InitResponse
            await new Promise<void>((resolveInit, rejectInit) => {
              const initTimer = setTimeout(() => {
                rejectInit(new Error('init response timeout'));
              }, CONNECT_TIMEOUT);

              const origHandler = ws.onmessage;
              ws.onmessage = async (event) => {
                clearTimeout(initTimer);
                try {
                  const data = new Uint8Array(event.data as ArrayBuffer);
                  const secureMsg = decodeSecureMessage(data);
                  const decrypted = await this.cryptoManager.decryptMessage(this.getSecret(), secureMsg);
                  const wsMsg = decodeWebSocketMessage(decrypted);
                  if (wsMsg.initResponse) {
                    resolveInit();
                  } else {
                    rejectInit(new Error('unexpected message during init'));
                  }
                } catch (err) {
                  rejectInit(err as Error);
                }
              };
            });

            // Set up message handler
            ws.onmessage = (event) => this.handleMessage(event);
            ws.onclose = () => this.handleClose();
            ws.onerror = (err) => {
              this.config.logger.error('ws error', err);
            };

            this.lastMessageAt = this.config.timeManager.getSystemTimestamp();
            this.startHealthCheck();
            this.startReconnectCheck();
            this.reconnectAttempt = 0;
            this.isReconnecting = false;

            resolve();
          } catch (err) {
            reject(err);
          }
        };

        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error('websocket connect failed'));
        };
      });
    } finally {
      this.isConnecting = false;
    }
  }

  private handleClose(): void {
    this.socket = null;
    this.clearTimers();
    if (!this.shouldClose) {
      this.reconnect();
    }
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    this.lastMessageAt = this.config.timeManager.getSystemTimestamp();

    try {
      const data = new Uint8Array(event.data as ArrayBuffer);
      const secureMsg = decodeSecureMessage(data);
      const decrypted = await this.cryptoManager.decryptMessage(this.getSecret(), secureMsg);
      const wsMsg = decodeWebSocketMessage(decrypted);

      if (wsMsg.pong) {
        this.config.timeManager.syncServerTimestamp(Number(wsMsg.pong.timestamp));
      } else if (wsMsg.event) {
        const header: EventHeader = {
          event_id: wsMsg.event.eventHeader?.eventId ?? '',
          event_type: wsMsg.event.eventHeader?.eventType ?? '',
          event_created_at: String(wsMsg.event.eventHeader?.eventCreatedAt ?? '0'),
        };

        const handlers = this.eventHandlerMap.get(header.event_type);
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(header, wsMsg.event.eventBody ?? new Uint8Array(0));
            } catch (err) {
              this.config.logger.error('event handler error', err);
            }
          }
        }

        // Send event ack
        this.sendMessage({ eventAck: { eventId: header.event_id } }).catch(() => {});
      } else if (wsMsg.httpResponse) {
        const reqId = wsMsg.httpResponse.reqId;
        const cb = this.reqCallbacks.get(reqId);
        if (cb) {
          clearTimeout(cb.timer);
          this.reqCallbacks.delete(reqId);
          cb.resolve(wsMsg.httpResponse);
        }
      }
    } catch (err) {
      this.config.logger.error('ws message parse error', err);
    }
  }

  private async sendMessage(msg: WebSocketMessage): Promise<void> {
    const WS = await getWebSocket();
    if (!this.socket || this.socket.readyState !== WS.OPEN) {
      throw new Error('websocket not connected');
    }

    const msgBytes = encodeWebSocketMessage(msg);
    const secureMsg = await this.cryptoManager.encryptMessage(this.getSecret(), msgBytes);
    const data = encodeSecureMessage(secureMsg);
    this.socket.send(data);
  }

  private reconnect(): void {
    if (this.shouldClose || this.isReconnecting) return;
    this.isReconnecting = true;

    const delay = this.getReconnectDelay();
    this.config.logger.info(`ws reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        this.config.logger.info('ws reconnected');
      } catch (err) {
        this.config.logger.error('ws reconnect failed', err);
        this.isReconnecting = false;
        this.reconnect();
      }
    }, delay);
  }

  private getReconnectDelay(): number {
    const attempt = this.reconnectAttempt;
    if (attempt <= 1) {
      return 250 + Math.floor(Math.random() * 250);
    }
    if (attempt <= 5) {
      return 750 + Math.floor(Math.random() * 500);
    }
    const min = Math.min(10000, Math.max(750, (attempt - 5 - 1) * 2000));
    const max = Math.min(15000, 1000 + (attempt - 5) * 2000);
    return min + Math.floor(Math.random() * (max - min));
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckTimer = setInterval(async () => {
      try {
        const timestamp = this.config.timeManager.getServerTimestamp();
        await this.sendMessage({ ping: { timestamp } });
      } catch {
        // ignore, reconnect check will handle it
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private startReconnectCheck(): void {
    this.stopReconnectCheck();
    this.reconnectCheckTimer = setInterval(() => {
      if (this.lastMessageAt !== 0 && this.config.timeManager.getSystemTimestamp() - this.lastMessageAt > ALIVE_TIMEOUT) {
        this.config.logger.warn('ws alive timeout, reconnecting');
        this.clearTimers();
        if (this.socket) {
          try { this.socket.close(); } catch { /* ignore */ }
          this.socket = null;
        }
        this.reconnect();
      }
    }, RECONNECT_CHECK_INTERVAL);
  }

  private stopReconnectCheck(): void {
    if (this.reconnectCheckTimer) {
      clearInterval(this.reconnectCheckTimer);
      this.reconnectCheckTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopHealthCheck();
    this.stopReconnectCheck();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
