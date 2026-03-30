// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import type { TimeManager } from './types';

export class DefaultTimeManager implements TimeManager {
  private serverTimeBase = 0;
  private systemTimeBase = 0;

  getSystemTimestamp(): number {
    return Date.now();
  }

  getServerTimestamp(): number {
    if (this.serverTimeBase === 0) {
      return this.getSystemTimestamp();
    }
    return this.getSystemTimestamp() - this.systemTimeBase + this.serverTimeBase;
  }

  syncServerTimestamp(timestamp: number): void {
    if (timestamp <= this.serverTimeBase) {
      return;
    }
    this.serverTimeBase = timestamp;
    this.systemTimeBase = this.getSystemTimestamp();
  }
}
