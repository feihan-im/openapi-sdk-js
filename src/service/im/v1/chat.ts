// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import type { Config } from '@/core/config';
import type { CreateTypingReq, CreateTypingResp, DeleteTypingReq, DeleteTypingResp } from './chat_model';

export class Chat {
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * 设置正在输入中
   * 
   * 设置正在输入中的状态，只持续五秒，仅限私聊
   */
  async createTyping(req: CreateTypingReq): Promise<CreateTypingResp> {
    const resp = await this.config.apiClient.request({
      method: 'POST',
      path: `/oapi/im/v1/chats/${req.chat_id ?? ''}/typing`,
      body: req,
      withAppAccessToken: true,
    });
    return await resp.json() as CreateTypingResp;
  }

  /**
   * 清除正在输入中
   * 
   * 仅限单聊
   */
  async deleteTyping(req: DeleteTypingReq): Promise<DeleteTypingResp> {
    const resp = await this.config.apiClient.request({
      method: 'DELETE',
      path: `/oapi/im/v1/chats/${req.chat_id ?? ''}/typing`,
      body: req,
      withAppAccessToken: true,
    });
    return await resp.json() as DeleteTypingResp;
  }
}
