// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import type { Config } from '@/core/config';
import { V1 } from './v1/index';
import { Chat } from './v1/chat';
import { Message } from './v1/message';

export class Service {
  public readonly v1: V1;
  public readonly Chat: Chat;
  public readonly Message: Message;

  constructor(config: Config) {
    this.v1 = new V1(config);
    this.Chat = this.v1.Chat;
    this.Message = this.v1.Message;
  }
}
