// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

// Self-contained protobuf encode/decode for transport.proto.
// Implements minimal protobuf wire format (varint + length-delimited) with zero dependencies.

// ---- Minimal Protobuf Writer ----

class ProtoWriter {
  private buf: Uint8Array;
  private pos = 0;
  private forkStack: number[] = [];

  constructor() {
    this.buf = new Uint8Array(256);
  }

  private grow(need: number): void {
    if (this.pos + need <= this.buf.length) return;
    let newLen = this.buf.length * 2;
    while (newLen < this.pos + need) newLen *= 2;
    const next = new Uint8Array(newLen);
    next.set(this.buf);
    this.buf = next;
  }

  uint32(value: number): this {
    this.grow(5);
    value >>>= 0;
    while (value > 127) {
      this.buf[this.pos++] = (value & 0x7f) | 0x80;
      value >>>= 7;
    }
    this.buf[this.pos++] = value;
    return this;
  }

  uint64(value: number): this {
    // Handle numbers up to 2^53 (safe integer range)
    this.grow(10);
    let lo = value >>> 0;
    let hi = ((value - lo) / 0x100000000) >>> 0;
    while (hi > 0) {
      this.buf[this.pos++] = (lo & 0x7f) | 0x80;
      lo = ((lo >>> 7) | (hi << 25)) >>> 0;
      hi >>>= 7;
    }
    while (lo > 127) {
      this.buf[this.pos++] = (lo & 0x7f) | 0x80;
      lo >>>= 7;
    }
    this.buf[this.pos++] = lo;
    return this;
  }

  int32(value: number): this {
    if (value >= 0) return this.uint32(value);
    // Negative int32 is encoded as 10-byte varint (sign-extended to 64 bits)
    this.grow(10);
    for (let i = 0; i < 9; i++) {
      this.buf[this.pos++] = (value & 0x7f) | 0x80;
      value >>= 7;
    }
    this.buf[this.pos++] = 1; // sign bit
    return this;
  }

  bytes(value: Uint8Array): this {
    this.uint32(value.length);
    this.grow(value.length);
    this.buf.set(value, this.pos);
    this.pos += value.length;
    return this;
  }

  string(value: string): this {
    const encoded = textEncoder.encode(value);
    return this.bytes(encoded);
  }

  /** Start a nested sub-message. Call ldelim() to close it. */
  fork(): this {
    this.forkStack.push(this.pos);
    // Reserve space — we'll patch the length in ldelim()
    this.grow(5);
    this.pos += 5; // max varint32 length
    return this;
  }

  /** Close a fork: writes the sub-message length prefix. */
  ldelim(): this {
    const startPos = this.forkStack.pop()!;
    const contentStart = startPos + 5; // content was written after the 5-byte reservation
    const contentLen = this.pos - contentStart;
    // Encode the length as varint
    const lenBytes: number[] = [];
    let v = contentLen;
    while (v > 127) {
      lenBytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    lenBytes.push(v);
    // Move content to sit right after the length varint
    const newContentStart = startPos + lenBytes.length;
    this.buf.copyWithin(newContentStart, contentStart, this.pos);
    // Write length varint at startPos
    for (let i = 0; i < lenBytes.length; i++) {
      this.buf[startPos + i] = lenBytes[i];
    }
    this.pos = newContentStart + contentLen;
    return this;
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

// ---- Minimal Protobuf Reader ----

class ProtoReader {
  private buf: Uint8Array;
  pos: number;
  len: number;

  constructor(data: Uint8Array) {
    this.buf = data;
    this.pos = 0;
    this.len = data.length;
  }

  uint32(): number {
    let value = 0;
    let shift = 0;
    let b: number;
    do {
      b = this.buf[this.pos++];
      value |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    return value >>> 0;
  }

  uint64(): number {
    // Read varint as a JS number (safe up to 2^53)
    let lo = 0;
    let hi = 0;
    let shift = 0;
    let b: number;
    // Read low 28 bits
    for (let i = 0; i < 4; i++) {
      b = this.buf[this.pos++];
      lo |= (b & 0x7f) << shift;
      shift += 7;
      if (!(b & 0x80)) return lo >>> 0;
    }
    // 5th byte spans lo/hi
    b = this.buf[this.pos++];
    lo |= (b & 0x7f) << 28;
    hi = (b & 0x7f) >> 4;
    if (!(b & 0x80)) return (hi * 0x100000000 + (lo >>> 0));
    shift = 3;
    // Read remaining high bits
    do {
      b = this.buf[this.pos++];
      hi |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    return (hi >>> 0) * 0x100000000 + (lo >>> 0);
  }

  int32(): number {
    return this.uint32() | 0;
  }

  bytes(): Uint8Array {
    const len = this.uint32();
    const value = this.buf.slice(this.pos, this.pos + len);
    this.pos += len;
    return value;
  }

  string(): string {
    const bytes = this.bytes();
    return textDecoder.decode(bytes);
  }

  skipType(wireType: number): void {
    switch (wireType) {
      case 0: // varint
        while (this.buf[this.pos++] & 0x80) { /* skip */ }
        break;
      case 1: // 64-bit
        this.pos += 8;
        break;
      case 2: // length-delimited
        this.pos += this.uint32();
        break;
      case 5: // 32-bit
        this.pos += 4;
        break;
      default:
        throw new Error(`unknown wire type: ${wireType}`);
    }
  }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// ---- SecureMessage ----

export interface SecureMessage {
  version: string;
  timestamp: number;
  nonce: string;
  encryptedKey: Uint8Array;
  encryptedData: Uint8Array;
}

export function encodeSecureMessage(msg: SecureMessage): Uint8Array {
  const w = new ProtoWriter();
  if (msg.version) w.uint32(10).string(msg.version);
  if (msg.timestamp) w.uint32(16).uint64(msg.timestamp);
  if (msg.nonce) w.uint32(26).string(msg.nonce);
  if (msg.encryptedKey?.length) w.uint32(34).bytes(msg.encryptedKey);
  if (msg.encryptedData?.length) w.uint32(42).bytes(msg.encryptedData);
  return w.finish();
}

export function decodeSecureMessage(data: Uint8Array): SecureMessage {
  const r = new ProtoReader(data);
  const msg: SecureMessage = { version: '', timestamp: 0, nonce: '', encryptedKey: new Uint8Array(0), encryptedData: new Uint8Array(0) };
  while (r.pos < r.len) {
    const tag = r.uint32();
    switch (tag >>> 3) {
      case 1: msg.version = r.string(); break;
      case 2: msg.timestamp = r.uint64(); break;
      case 3: msg.nonce = r.string(); break;
      case 4: msg.encryptedKey = r.bytes(); break;
      case 5: msg.encryptedData = r.bytes(); break;
      default: r.skipType(tag & 7); break;
    }
  }
  return msg;
}

// ---- HttpRequest ----

export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Uint8Array;
  reqId: string;
}

export function encodeHttpRequest(msg: HttpRequest): Uint8Array {
  const w = new ProtoWriter();
  if (msg.method) w.uint32(10).string(msg.method);
  if (msg.path) w.uint32(18).string(msg.path);
  if (msg.headers) {
    for (const [k, v] of Object.entries(msg.headers)) {
      w.uint32(26).fork().uint32(10).string(k).uint32(18).string(v).ldelim();
    }
  }
  if (msg.body?.length) w.uint32(34).bytes(msg.body);
  if (msg.reqId) w.uint32(42).string(msg.reqId);
  return w.finish();
}

export function decodeHttpRequest(data: Uint8Array): HttpRequest {
  const r = new ProtoReader(data);
  const msg: HttpRequest = { method: '', path: '', headers: {}, body: new Uint8Array(0), reqId: '' };
  while (r.pos < r.len) {
    const tag = r.uint32();
    switch (tag >>> 3) {
      case 1: msg.method = r.string(); break;
      case 2: msg.path = r.string(); break;
      case 3: {
        const entryEnd = r.uint32() + r.pos;
        let key = '', value = '';
        while (r.pos < entryEnd) {
          const entryTag = r.uint32();
          switch (entryTag >>> 3) {
            case 1: key = r.string(); break;
            case 2: value = r.string(); break;
            default: r.skipType(entryTag & 7); break;
          }
        }
        msg.headers[key] = value;
        break;
      }
      case 4: msg.body = r.bytes(); break;
      case 5: msg.reqId = r.string(); break;
      default: r.skipType(tag & 7); break;
    }
  }
  return msg;
}

// ---- HttpResponse ----

export interface HttpResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: Uint8Array;
  reqId: string;
}

export function decodeHttpResponse(data: Uint8Array): HttpResponse {
  const r = new ProtoReader(data);
  const msg: HttpResponse = { statusCode: 0, statusText: '', headers: {}, body: new Uint8Array(0), reqId: '' };
  while (r.pos < r.len) {
    const tag = r.uint32();
    switch (tag >>> 3) {
      case 1: msg.statusCode = r.int32(); break;
      case 2: msg.statusText = r.string(); break;
      case 3: {
        const entryEnd = r.uint32() + r.pos;
        let key = '', value = '';
        while (r.pos < entryEnd) {
          const entryTag = r.uint32();
          switch (entryTag >>> 3) {
            case 1: key = r.string(); break;
            case 2: value = r.string(); break;
            default: r.skipType(entryTag & 7); break;
          }
        }
        msg.headers[key] = value;
        break;
      }
      case 4: msg.body = r.bytes(); break;
      case 5: msg.reqId = r.string(); break;
      default: r.skipType(tag & 7); break;
    }
  }
  return msg;
}

// ---- WebSocketMessage ----

export interface EventHeader {
  eventId: string;
  eventType: string;
  eventCreatedAt: number;
}

export interface WsEvent {
  eventHeader?: EventHeader;
  eventBody: Uint8Array;
}

export interface WebSocketMessage {
  ping?: { timestamp: number };
  pong?: { timestamp: number };
  initRequest?: { userAgent: string };
  initResponse?: Record<string, never>;
  event?: WsEvent;
  eventAck?: { eventId: string };
  httpRequest?: HttpRequest;
  httpResponse?: HttpResponse;
}

export function encodeWebSocketMessage(msg: WebSocketMessage): Uint8Array {
  const w = new ProtoWriter();
  if (msg.ping) {
    w.uint32(10).fork();
    if (msg.ping.timestamp) w.uint32(8).uint64(msg.ping.timestamp);
    w.ldelim();
  }
  if (msg.pong) {
    w.uint32(18).fork();
    if (msg.pong.timestamp) w.uint32(8).uint64(msg.pong.timestamp);
    w.ldelim();
  }
  if (msg.initRequest) {
    w.uint32(26).fork();
    if (msg.initRequest.userAgent) w.uint32(10).string(msg.initRequest.userAgent);
    w.ldelim();
  }
  if (msg.initResponse) {
    w.uint32(34).fork().ldelim();
  }
  if (msg.event) {
    w.uint32(42).fork();
    if (msg.event.eventHeader) {
      w.uint32(10).fork();
      if (msg.event.eventHeader.eventId) w.uint32(10).string(msg.event.eventHeader.eventId);
      if (msg.event.eventHeader.eventType) w.uint32(18).string(msg.event.eventHeader.eventType);
      if (msg.event.eventHeader.eventCreatedAt) w.uint32(24).uint64(msg.event.eventHeader.eventCreatedAt);
      w.ldelim();
    }
    if (msg.event.eventBody?.length) w.uint32(18).bytes(msg.event.eventBody);
    w.ldelim();
  }
  if (msg.eventAck) {
    w.uint32(50).fork();
    if (msg.eventAck.eventId) w.uint32(10).string(msg.eventAck.eventId);
    w.ldelim();
  }
  if (msg.httpRequest) {
    w.uint32(58).bytes(encodeHttpRequest(msg.httpRequest));
  }
  return w.finish();
}

export function decodeWebSocketMessage(data: Uint8Array): WebSocketMessage {
  const r = new ProtoReader(data);
  const msg: WebSocketMessage = {};
  while (r.pos < r.len) {
    const tag = r.uint32();
    switch (tag >>> 3) {
      case 1: { // ping
        const subEnd = r.uint32() + r.pos;
        const ping = { timestamp: 0 };
        while (r.pos < subEnd) {
          const subTag = r.uint32();
          if ((subTag >>> 3) === 1) ping.timestamp = r.uint64();
          else r.skipType(subTag & 7);
        }
        msg.ping = ping;
        break;
      }
      case 2: { // pong
        const subEnd = r.uint32() + r.pos;
        const pong = { timestamp: 0 };
        while (r.pos < subEnd) {
          const subTag = r.uint32();
          if ((subTag >>> 3) === 1) pong.timestamp = r.uint64();
          else r.skipType(subTag & 7);
        }
        msg.pong = pong;
        break;
      }
      case 3: { // initRequest
        const subEnd = r.uint32() + r.pos;
        const initReq = { userAgent: '' };
        while (r.pos < subEnd) {
          const subTag = r.uint32();
          if ((subTag >>> 3) === 1) initReq.userAgent = r.string();
          else r.skipType(subTag & 7);
        }
        msg.initRequest = initReq;
        break;
      }
      case 4: { // initResponse
        const subEnd = r.uint32() + r.pos;
        r.pos = subEnd;
        msg.initResponse = {};
        break;
      }
      case 5: { // event
        const subEnd = r.uint32() + r.pos;
        const event: WsEvent = { eventBody: new Uint8Array(0) };
        while (r.pos < subEnd) {
          const subTag = r.uint32();
          switch (subTag >>> 3) {
            case 1: {
              const headerEnd = r.uint32() + r.pos;
              const header: EventHeader = { eventId: '', eventType: '', eventCreatedAt: 0 };
              while (r.pos < headerEnd) {
                const hTag = r.uint32();
                switch (hTag >>> 3) {
                  case 1: header.eventId = r.string(); break;
                  case 2: header.eventType = r.string(); break;
                  case 3: header.eventCreatedAt = r.uint64(); break;
                  default: r.skipType(hTag & 7); break;
                }
              }
              event.eventHeader = header;
              break;
            }
            case 2: event.eventBody = r.bytes(); break;
            default: r.skipType(subTag & 7); break;
          }
        }
        msg.event = event;
        break;
      }
      case 6: { // eventAck
        const subEnd = r.uint32() + r.pos;
        const ack = { eventId: '' };
        while (r.pos < subEnd) {
          const subTag = r.uint32();
          if ((subTag >>> 3) === 1) ack.eventId = r.string();
          else r.skipType(subTag & 7);
        }
        msg.eventAck = ack;
        break;
      }
      case 7: {
        const bytes = r.bytes();
        msg.httpRequest = decodeHttpRequest(bytes);
        break;
      }
      case 8: {
        const bytes = r.bytes();
        msg.httpResponse = decodeHttpResponse(bytes);
        break;
      }
      default: r.skipType(tag & 7); break;
    }
  }
  return msg;
}
