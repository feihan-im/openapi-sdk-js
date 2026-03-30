# Feihan IM OpenAPI SDK - JavaScript

[![npm version](https://img.shields.io/npm/v/@feihan-im/openapi-sdk.svg)](https://www.npmjs.com/package/@feihan-im/openapi-sdk)
[![License](https://img.shields.io/github/license/feihan-im/openapi-sdk-js)](LICENSE)

English | [中文](README.md)

Feihan is a secure, self-hosted productivity platform, integrating instant messaging, organizational structures, video conferencing, and file storage.

This is the official JavaScript SDK for Feihan server, used to interact with the Feihan server via OpenAPI. You need to deploy the Feihan server before using this SDK. See the [Quick Deploy Guide](https://feihanim.cn/docs/admin/install/quick-install) for setup instructions.

## Installation

```bash
npm install @feihan-im/openapi-sdk
```

WebSocket is natively supported in browsers and Node.js 22+. For Node.js < 22, install [`ws`](https://www.npmjs.com/package/ws):

```bash
npm install ws
```

## Quick Start

```typescript
import { Client } from '@feihan-im/openapi-sdk';

const client = await Client.create(
  'https://your-backend-url.com',
  'your-app-id',
  'your-app-secret',
);

// Optional: preheat fetches access token and syncs server time upfront,
// reducing latency on the first API call
await client.preheat();

// Call API
const resp = await client.Im.v1.Message.sendMessage({
  chat_id: 'chat-id',
  message_type: 'text',
  message_content: { text: { content: 'Feihan new version released!' } },
});
console.log(resp);

// Close when done
await client.close();
```

## Configuration

`Client.create()` accepts an optional options object to configure client behavior:

```typescript
import { Client, LoggerLevel } from '@feihan-im/openapi-sdk';

const client = await Client.create(
  'https://your-backend-url.com',
  'your-app-id',
  'your-app-secret',
  {
    logLevel: LoggerLevel.Debug,         // Log level (default: Info)
    requestTimeout: 30_000,              // Request timeout in ms (default: 60000)
    enableEncryption: false,             // Enable request encryption (default: true)
  },
);
```

## Event Subscription

Receive real-time events via WebSocket:

```typescript
// Register event handler
const handlerId = client.Im.v1.Message.Event.onMessageReceive((event) => {
  console.log('Message received:', event);
});

// Unsubscribe
client.Im.v1.Message.Event.offMessageReceive(handlerId);
```

## Error Handling

API responses include `code` and `msg` fields. A `code` of `0` indicates success:

```typescript
const resp = await client.Im.v1.Message.sendMessage({
  chat_id: 'chat-id',
  message_type: 'text',
  message_content: { text: { content: 'Feihan new version released!' } },
});
if (resp.code !== 0) {
  console.error(`Request failed: code=${resp.code}, msg=${resp.msg}`);
}
```

## Requirements

- **Node.js** 18+ (requires `fetch`, `crypto.subtle`, `CompressionStream`)
- **Browsers**: Modern browsers with Web Crypto API and CompressionStream support
- **TypeScript** 5.0+ (optional, type declarations are included)

## Links

- [Website](https://feihanim.cn/)

## License

[Apache-2.0 License](LICENSE)
