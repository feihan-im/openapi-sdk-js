// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import type { HttpClient } from './types';

export class DefaultHttpClient implements HttpClient {
  private timeout: number;

  constructor(timeout: number = 60000) {
    this.timeout = timeout;
  }

  async fetch(url: string, init: RequestInit): Promise<Response> {
    if (this.timeout > 0) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }
    return fetch(url, init);
  }
}
