// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import type { Config } from '@/core/config';
import type {
  ApiClient,
  HttpClient,
  Logger,
  TimeManager,
  Marshaller,
  Unmarshaller,
} from '@/core/types';
import { LoggerLevel } from '@/core/types';
import { DefaultApiClient } from '@/core/api_client';
import { DefaultHttpClient } from '@/core/http_client';
import { DefaultLogger } from '@/core/logger';
import { DefaultTimeManager } from '@/core/time_manager';
import { Service as ImService } from '@/service/im/index';

export interface FeihanClientOptions {
  httpClient?: HttpClient;
  requestTimeout?: number;
  enableEncryption?: boolean;
  logLevel?: LoggerLevel;
  logger?: Logger;
  timeManager?: TimeManager;
  jsonMarshal?: Marshaller;
  jsonUnmarshal?: Unmarshaller;
}

export class FeihanClient {
  public readonly config: Config;
  public readonly apiClient: ApiClient;
  public readonly Im: ImService;

  private constructor(config: Config) {
    this.config = config;
    this.apiClient = config.apiClient;
    this.Im = new ImService(config);
  }

  static async create(
    backendUrl: string,
    appId: string,
    appSecret: string,
    options: FeihanClientOptions = {},
  ): Promise<FeihanClient> {
    // Normalize backend URL
    backendUrl = backendUrl.replace(/\/+$/, '');

    const logger = options.logger ?? new DefaultLogger(options.logLevel ?? LoggerLevel.Info);
    const httpClient = options.httpClient ?? new DefaultHttpClient(options.requestTimeout ?? 60_000);
    const timeManager = options.timeManager ?? new DefaultTimeManager();
    const jsonMarshal = options.jsonMarshal ?? ((v: unknown) => JSON.stringify(v));
    const jsonUnmarshal = options.jsonUnmarshal ?? ((s: string) => JSON.parse(s));

    const config: Config = {
      appId,
      appSecret,
      backendUrl,
      httpClient,
      apiClient: null!, // will be set below
      enableEncryption: options.enableEncryption ?? true,
      requestTimeout: options.requestTimeout ?? 60_000,
      timeManager,
      logger,
      jsonMarshal,
      jsonUnmarshal,
    };

    const apiClient = new DefaultApiClient(config);
    await apiClient.init();
    config.apiClient = apiClient;

    return new FeihanClient(config);
  }

  async preheat(): Promise<void> {
    await this.apiClient.preheat();
  }

  async close(): Promise<void> {
    await this.apiClient.close();
  }
}
