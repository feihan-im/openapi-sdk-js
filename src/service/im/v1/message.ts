// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import type { Config } from '@/core/config';
import { MessageEvent } from './message_event';
import type { GetMessageReq, GetMessageResp, ReadMessageReq, ReadMessageResp, RecallMessageReq, RecallMessageResp, SendMessageReq, SendMessageResp } from './message_model';

export class Message {
  private readonly config: Config;
  public readonly Event: MessageEvent;

  constructor(config: Config) {
    this.config = config;
    this.Event = new MessageEvent(config);
  }

  /** 发送消息 */
  async sendMessage(req: SendMessageReq): Promise<SendMessageResp> {
    const resp = await this.config.apiClient.request({
      method: 'POST',
      path: '/oapi/im/v1/messages',
      body: req,
      withAppAccessToken: true,
      withWebSocket: true,
    });
    return await resp.json() as SendMessageResp;
  }

  /** 获取消息 */
  async getMessage(req: GetMessageReq): Promise<GetMessageResp> {
    const resp = await this.config.apiClient.request({
      method: 'GET',
      path: `/oapi/im/v1/messages/${req.message_id ?? ''}`,
      body: req,
      withAppAccessToken: true,
    });
    return await resp.json() as GetMessageResp;
  }

  /** 撤回消息 */
  async recallMessage(req: RecallMessageReq): Promise<RecallMessageResp> {
    const resp = await this.config.apiClient.request({
      method: 'POST',
      path: `/oapi/im/v1/messages/${req.message_id ?? ''}/recall`,
      body: req,
      withAppAccessToken: true,
    });
    return await resp.json() as RecallMessageResp;
  }

  /** 阅读消息 */
  async readMessage(req: ReadMessageReq): Promise<ReadMessageResp> {
    const resp = await this.config.apiClient.request({
      method: 'POST',
      path: `/oapi/im/v1/messages/${req.message_id ?? ''}/read`,
      body: req,
      withAppAccessToken: true,
    });
    return await resp.json() as ReadMessageResp;
  }
}
