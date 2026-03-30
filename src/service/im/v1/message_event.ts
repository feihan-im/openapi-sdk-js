// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import type { Config } from '@/core/config';
import type { EventHeader, WrappedEventHandler } from '@/core/types';
import type { EventMessageReceiveBody } from './message_model';

/** 接收消息 */
export interface EventMessageReceive {
  header: EventHeader;
  body: EventMessageReceiveBody;
}

export class MessageEvent {
  private readonly config: Config;
  private readonly handlerMap = new Map<Function, WrappedEventHandler>();

  constructor(config: Config) {
    this.config = config;
  }

  /** 接收消息 */
  onMessageReceive(handler: (event: EventMessageReceive) => void): void {
    const wrappedHandler = (header: EventHeader, body: Uint8Array | string): void => {
      const event: EventMessageReceive = {
        header,
        body: typeof body === 'string' ? JSON.parse(body) as EventMessageReceiveBody : JSON.parse(new TextDecoder().decode(body)) as EventMessageReceiveBody,
      };
      handler(event);
    };
    this.handlerMap.set(handler, wrappedHandler);
    this.config.apiClient.onEvent('im.v1.message.receive', wrappedHandler);
  }

  offMessageReceive(handler: (event: EventMessageReceive) => void): void {
    const wrappedHandler = this.handlerMap.get(handler);
    if (wrappedHandler) {
      this.config.apiClient.offEvent('im.v1.message.receive', wrappedHandler);
      this.handlerMap.delete(handler);
    }
  }
}
