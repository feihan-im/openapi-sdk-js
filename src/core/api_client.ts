// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import type { Config } from './config';
import {
  ApiError,
} from './types';
import type {
  ApiClient,
  ApiRequest,
  ApiResponse,
  EventHeader,
  WrappedEventHandler,
} from './types';
import { USER_AGENT } from './version';
import {
  DEFAULT_PING_PATH,
  DEFAULT_TOKEN_PATH,
  DEFAULT_GATEWAY_PATH,
} from './consts';
import { CryptoManager, sha256Hex } from './crypto';
import { WsClient } from './ws_client';
import {
  encodeSecureMessage,
  decodeSecureMessage,
  encodeHttpRequest,
  decodeHttpResponse,
} from '@/internal/transport';
import type { HttpRequest } from '@/internal/transport';

const TIMESTAMP_HEADER = 'X-Feihan-Timestamp';
const NONCE_HEADER = 'X-Feihan-Nonce';

export class DefaultApiClient implements ApiClient {
  private config: Config;
  private secret: string = '';
  private token: string = '';
  private tokenRefreshAt: number = 0;
  private tokenExpiresAt: number = 0;
  private tokenFetching: boolean = false;
  private tokenPromise: Promise<void> | null = null;
  private pingCalled: boolean = false;
  private pingExpiresAt: number = 0;
  private pingFetching: boolean = false;
  private pingPromise: Promise<void> | null = null;
  private cryptoManager: CryptoManager;
  private ws: WsClient;

  constructor(config: Config) {
    this.config = config;
    this.cryptoManager = new CryptoManager(config);
    this.ws = new WsClient({
      config,
      getSecret: () => this.secret,
      getToken: () => this.getToken(),
      ensurePing: () => this.ensurePing(),
      cryptoManager: this.cryptoManager,
    });
  }

  async init(): Promise<void> {
    this.secret = await sha256Hex(`${this.config.appId}:${this.config.appSecret}`);
  }

  async preheat(): Promise<void> {
    await this.ensurePing();
    await this.getToken();
  }

  async close(): Promise<void> {
    this.ws.close();
  }

  onEvent(eventType: string, handler: WrappedEventHandler): void {
    this.ws.onEvent(eventType, handler);
  }

  offEvent(eventType: string, handler: WrappedEventHandler): void {
    this.ws.offEvent(eventType, handler);
  }

  async request(req: ApiRequest): Promise<ApiResponse> {
    await this.ensurePing();

    // Build URL
    let path = req.path;
    if (req.pathParams) {
      for (const [key, value] of Object.entries(req.pathParams)) {
        path = path.replace(`:${key}`, encodeURIComponent(value));
      }
    }

    let url = this.config.backendUrl + path;
    if (req.queryParams) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(req.queryParams)) {
        params.set(key, value);
      }
      const qs = params.toString();
      if (qs) url += '?' + qs;
    }

    // Encrypted path
    if (this.config.enableEncryption && req.withAppAccessToken) {
      const token = await this.getToken();
      const bodyBytes = req.body
        ? new TextEncoder().encode(this.config.jsonMarshal(req.body))
        : new Uint8Array(0);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        [TIMESTAMP_HEADER]: String(this.config.timeManager.getServerTimestamp()),
        [NONCE_HEADER]: randomAlphanumeric(16),
      };
      if (req.headerParams) {
        Object.assign(headers, req.headerParams);
      }

      const httpReq: HttpRequest = {
        method: req.method,
        path: url.replace(this.config.backendUrl, ''),
        headers,
        body: bodyBytes,
        reqId: '',
      };

      // WebSocket path
      if (req.withWebSocket) {
        if (!httpReq.headers!['Authorization']) {
          httpReq.headers!['Authorization'] = `Bearer ${token}`;
        }
        const httpResp = await this.ws.httpRequest(httpReq);
        return {
          json: async () => unwrapApiResponse(JSON.parse(new TextDecoder().decode(httpResp.body))),
          body: async () => httpResp.body instanceof Uint8Array ? httpResp.body : new Uint8Array(httpResp.body),
        };
      }

      // Gateway path
      const httpReqBytes = encodeHttpRequest(httpReq);
      const secureMessage = await this.cryptoManager.encryptMessage(this.secret, httpReqBytes);
      const secureBytes = encodeSecureMessage(secureMessage);

      const gatewayUrl = this.config.backendUrl + DEFAULT_GATEWAY_PATH;
      const resp = await this.config.httpClient.fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-protobuf',
          'Authorization': `Bearer ${token}`,
          'User-Agent': USER_AGENT,
        },
        body: secureBytes as unknown as BodyInit,
      });

      const respBytes = new Uint8Array(await resp.arrayBuffer());
      const respSecureMessage = decodeSecureMessage(respBytes);
      const decryptedBytes = await this.cryptoManager.decryptMessage(this.secret, respSecureMessage);
      const httpResp = decodeHttpResponse(decryptedBytes);

      return {
        json: async () => unwrapApiResponse(JSON.parse(new TextDecoder().decode(httpResp.body))),
        body: async () => httpResp.body instanceof Uint8Array ? httpResp.body : new Uint8Array(httpResp.body),
      };
    }

    // Plain HTTP path
    const timestamp = String(this.config.timeManager.getServerTimestamp());
    const nonce = randomAlphanumeric(16);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      [TIMESTAMP_HEADER]: timestamp,
      [NONCE_HEADER]: nonce,
    };

    if (req.withAppAccessToken) {
      const token = await this.getToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (req.headerParams) {
      for (const [key, value] of Object.entries(req.headerParams)) {
        if (value) headers[key] = value;
      }
    }

    const fetchInit: RequestInit = {
      method: req.method,
      headers,
    };
    if (req.body && req.method !== 'GET') {
      fetchInit.body = this.config.jsonMarshal(req.body);
    }

    const resp = await this.config.httpClient.fetch(url, fetchInit);
    return {
      json: async () => unwrapApiResponse(await resp.json()),
      body: async () => new Uint8Array(await resp.arrayBuffer()),
    };
  }

  // --- Token management ---

  private async getToken(): Promise<string> {
    const now = this.config.timeManager.getServerTimestamp();

    // Token still fully valid
    if (this.token && this.tokenRefreshAt > now) {
      return this.token;
    }

    // Token expired
    if (!this.token || this.tokenExpiresAt <= now) {
      if (this.tokenPromise) {
        await this.tokenPromise;
        return this.token;
      }
      this.tokenPromise = this.fetchToken();
      try {
        await this.tokenPromise;
      } finally {
        this.tokenPromise = null;
      }
      return this.token;
    }

    // Token near expiry, refresh in background
    if (!this.tokenFetching) {
      this.tokenFetching = true;
      this.fetchToken().finally(() => {
        this.tokenFetching = false;
      });
    }

    return this.token;
  }

  private async fetchToken(): Promise<void> {
    const timestamp = this.config.timeManager.getServerTimestamp();
    const nonce = randomInt(1e12);
    const signPayload = `${this.config.appId}:${timestamp}:${this.config.appSecret}:${nonce}`;
    const signature = await sha256Hex(signPayload);

    const url = this.config.backendUrl + DEFAULT_TOKEN_PATH;
    const resp = await this.config.httpClient.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        app_id: this.config.appId,
        signature_version: 'v1',
        signature,
        timestamp,
        nonce,
      }),
    });

    const data = await resp.json() as {
      code: number;
      msg: string;
      data?: {
        app_access_token: string;
        app_access_token_expires_in: number;
      };
    };

    if (data.code !== 0 || !data.data) {
      throw new Error(`fetch token failed: code=${data.code}, msg=${data.msg}`);
    }

    this.token = data.data.app_access_token;
    const now = this.config.timeManager.getServerTimestamp();
    this.tokenExpiresAt = now + (data.data.app_access_token_expires_in - 60) * 1000;
    this.tokenRefreshAt = this.tokenExpiresAt - 5 * 60 * 1000;
  }

  // --- Ping / server time sync ---

  private async ensurePing(): Promise<void> {
    const now = Date.now();

    if (this.pingCalled && this.pingExpiresAt > now) {
      return;
    }

    if (!this.pingCalled || this.pingExpiresAt <= now) {
      if (this.pingPromise) {
        await this.pingPromise;
        return;
      }
      this.pingPromise = this.fetchPing();
      try {
        await this.pingPromise;
      } finally {
        this.pingPromise = null;
      }
      return;
    }

    // Background refresh
    if (!this.pingFetching) {
      this.pingFetching = true;
      this.fetchPing().finally(() => {
        this.pingFetching = false;
      });
    }
  }

  private async fetchPing(): Promise<void> {
    const url = this.config.backendUrl + DEFAULT_PING_PATH;
    const resp = await this.config.httpClient.fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT },
    });

    const data = await resp.json() as {
      code: number;
      msg: string;
      data?: {
        version: string;
        timestamp: number;
        org_code: string;
      };
    };

    if (data.code !== 0 || !data.data) {
      throw new Error(`ping failed: code=${data.code}, msg=${data.msg}`);
    }

    this.config.timeManager.syncServerTimestamp(data.data.timestamp);
    this.pingCalled = true;
    this.pingExpiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
    this.config.logger.info(`ping ok, server version=${data.data.version}, org_code=${data.data.org_code}`);
  }
}

// --- Helpers ---

const ALPHANUMERIC = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomAlphanumeric(size: number): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < size; i++) {
    result += ALPHANUMERIC[bytes[i] % 62];
  }
  return result;
}

function unwrapApiResponse(raw: unknown): unknown {
  const resp = raw as { code?: number; msg?: string; log_id?: string; data?: unknown };
  if (resp.code !== 0) {
    throw new ApiError(resp.code ?? -1, resp.msg ?? 'unknown error', resp.log_id ?? '', resp.data);
  }
  return resp.data;
}

function randomInt(max: number): number {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let value = 0;
  for (let i = 0; i < 8; i++) {
    value = value * 256 + bytes[i];
  }
  return value % max;
}
