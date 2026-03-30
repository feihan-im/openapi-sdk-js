// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import type {
  ApiClient,
  HttpClient,
  Logger,
  TimeManager,
  Marshaller,
  Unmarshaller,
} from './types';

export interface Config {
  appId: string;
  appSecret: string;
  backendUrl: string;
  httpClient: HttpClient;
  apiClient: ApiClient;
  enableEncryption: boolean;
  requestTimeout: number;
  timeManager: TimeManager;
  logger: Logger;
  jsonMarshal: Marshaller;
  jsonUnmarshal: Unmarshaller;
}
