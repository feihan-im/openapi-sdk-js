// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import type { Config } from '@/core/config';
import { Chat } from './chat';
import { Message } from './message';

export class V1 {
  public readonly Chat: Chat;
  public readonly Message: Message;

  constructor(config: Config) {
    this.Chat = new Chat(config);
    this.Message = new Message(config);
  }
}
