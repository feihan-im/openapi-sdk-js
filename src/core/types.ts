// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

/** 64-bit integer represented as string to avoid precision loss */
export type Int64 = string;

export interface ApiRequest {
  method: string;
  path: string;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  headerParams?: Record<string, string>;
  body?: unknown;
  stream?: ReadableStream<Uint8Array> | null;
  withAppAccessToken?: boolean;
  withWebSocket?: boolean;
}

export interface ApiResponse {
  json(): Promise<unknown>;
  body(): Promise<Uint8Array>;
}

export interface ApiError {
  code: number;
  msg: string;
  log_id: string;
  data?: unknown;
}

export interface ApiClient {
  preheat(): Promise<void>;
  request(req: ApiRequest): Promise<ApiResponse>;
  onEvent(eventType: string, handler: WrappedEventHandler): void;
  offEvent(eventType: string, handler: WrappedEventHandler): void;
  close(): Promise<void>;
}

export interface EventHeader {
  event_id: string;
  event_type: string;
  event_created_at: Int64;
}

export type WrappedEventHandler = (header: EventHeader, body: Uint8Array | string) => void;

export type Marshaller = (v: unknown) => string;
export type Unmarshaller = (data: string) => unknown;

export interface HttpClient {
  fetch(url: string, init: RequestInit): Promise<Response>;
}

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export enum LoggerLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

export interface TimeManager {
  getSystemTimestamp(): number;
  getServerTimestamp(): number;
  syncServerTimestamp(timestamp: number): void;
}
