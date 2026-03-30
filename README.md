# 飞函 IM OpenAPI SDK - JavaScript

[![npm version](https://img.shields.io/npm/v/@feihan-im/openapi-sdk.svg)](https://www.npmjs.com/package/@feihan-im/openapi-sdk)
[![License](https://img.shields.io/github/license/feihan-im/openapi-sdk-js)](LICENSE)

[English](README_en.md) | 中文

飞函，是安全稳定的私有化一站式办公平台，功能包括即时通讯、组织架构、音视频会议、网盘等。

本项目是飞函服务端的 JavaScript SDK，用于通过 OpenAPI 与飞函服务端进行交互。使用前需要先自行部署飞函服务端，部署教程请参考[快速部署文档](https://feihanim.cn/docs/admin/install/quick-install)。

## 安装

```bash
npm install @feihan-im/openapi-sdk
```

WebSocket 功能在浏览器和 Node.js 22+ 中原生支持。Node.js < 22 需安装 [`ws`](https://www.npmjs.com/package/ws)：

```bash
npm install ws
```

## 快速开始

```typescript
import { Client } from '@feihan-im/openapi-sdk';

const client = await Client.create(
  'https://your-backend-url.com',
  'your-app-id',
  'your-app-secret',
);

// 可选：预热可提前获取访问凭证和同步服务端时间，减少首次调用的延迟
await client.preheat();

// 调用 API
const resp = await client.Im.v1.Message.sendMessage({
  chat_id: 'chat-id',
  message_type: 'text',
  message_content: { text: { content: '飞函新版本发布！' } },
});
console.log(resp);

// 使用完毕后关闭
await client.close();
```

## 客户端配置

`Client.create()` 支持通过可选参数配置客户端行为：

```typescript
import { Client, LoggerLevel } from '@feihan-im/openapi-sdk';

const client = await Client.create(
  'https://your-backend-url.com',
  'your-app-id',
  'your-app-secret',
  {
    logLevel: LoggerLevel.Debug,         // 日志级别（默认: Info）
    requestTimeout: 30_000,              // 请求超时毫秒数（默认: 60000）
    enableEncryption: false,             // 启用请求加密（默认: true）
  },
);
```

## 事件订阅

通过 WebSocket 接收实时事件推送：

```typescript
// 注册事件处理函数
const handlerId = client.Im.v1.Message.Event.onMessageReceive((event) => {
  console.log('收到消息:', event);
});

// 取消订阅
client.Im.v1.Message.Event.offMessageReceive(handlerId);
```

## 错误处理

API 调用返回的响应中包含 `code` 和 `msg` 字段，`code` 为 `0` 表示请求成功：

```typescript
const resp = await client.Im.v1.Message.sendMessage({
  chat_id: 'chat-id',
  message_type: 'text',
  message_content: { text: { content: '飞函新版本发布！' } },
});
if (resp.code !== 0) {
  console.error(`请求失败: code=${resp.code}, msg=${resp.msg}`);
}
```

## 环境要求

- **Node.js** 18+（需支持 `fetch`、`crypto.subtle`、`CompressionStream`）
- **浏览器**：现代浏览器（需支持 Web Crypto API 和 CompressionStream）
- **TypeScript** 5.0+（可选，SDK 内置类型声明）

## 相关链接

- [官网](https://feihanim.cn/)

## 许可证

[Apache-2.0 License](LICENSE)
