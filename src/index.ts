// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

export { FeihanClient } from '@/client';
export type { FeihanClientOptions } from '@/client';
export { LoggerLevel } from '@/core/types';
export { ApiError } from '@/core/types';
export type {
  Int64,
  ApiClient,
  ApiRequest,
  ApiResponse,
  EventHeader,
  HttpClient,
  Logger,
  TimeManager,
} from '@/core/types';
export type { Config } from '@/core/config';
export { VERSION, USER_AGENT } from '@/core/version';

// Service exports
export * from '@/service/im/v1/index';
