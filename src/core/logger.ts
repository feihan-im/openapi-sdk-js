// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import { LoggerLevel } from './types';
import type { Logger } from './types';

export class DefaultLogger implements Logger {
  private level: LoggerLevel;

  constructor(level: LoggerLevel = LoggerLevel.Info) {
    this.level = level;
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.level <= LoggerLevel.Debug) {
      console.debug(`[Feihan] DEBUG ${msg}`, ...args);
    }
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.level <= LoggerLevel.Info) {
      console.info(`[Feihan] INFO ${msg}`, ...args);
    }
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.level <= LoggerLevel.Warn) {
      console.warn(`[Feihan] WARN ${msg}`, ...args);
    }
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.level <= LoggerLevel.Error) {
      console.error(`[Feihan] ERROR ${msg}`, ...args);
    }
  }
}
