# Feihan IM OpenAPI SDK - JavaScript/TypeScript

[![npm version](https://img.shields.io/npm/v/@feihan-im/openapi-sdk.svg)](https://www.npmjs.com/package/@feihan-im/openapi-sdk)
[![License](https://img.shields.io/github/license/feihan-im/openapi-sdk-js)](LICENSE)

English | [中文](README_zh.md)

Feihan is a secure, self-hosted productivity platform, integrating instant messaging, organizational structures, video conferencing, and file storage.

This is the official JavaScript/TypeScript SDK for Feihan server, used to interact with the Feihan server via OpenAPI. You need to deploy the Feihan server before using this SDK. See the [Quick Deploy Guide](https://feihanim.cn/docs/admin/install/quick-install) for setup instructions.

## Requirements

- **Node.js**: 18+ recommended (requires `fetch`, `crypto.subtle`, `CompressionStream`)
- **Browsers**: Modern browsers with Web Crypto API and CompressionStream support
- **TypeScript**: 5.0+ (optional)
- **WebSocket** (optional): Natively supported in browsers and Node.js 22+; for Node.js < 22, install [`ws`](https://www.npmjs.com/package/ws)

## Installation

```bash
npm install @feihan-im/openapi-sdk
```

## Quick Start

```typescript
import { Client } from '@feihan-im/openapi-sdk';

// Create client (async initialization)
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
  msg_type: 'text',
  content: JSON.stringify({ text: 'Feihan new version released!' }),
});
console.log(resp);

// Close when done
await client.close();
```

## Authentication

This SDK uses app-level authentication. Pass your App ID and App Secret when creating the client. The SDK automatically manages access token retrieval and refresh.

## Configuration

`Client.create()` accepts an optional options object to configure client behavior:

```typescript
import { Client, LogLevel } from '@feihan-im/openapi-sdk';

const client = await Client.create(
  'https://your-backend-url.com',
  'your-app-id',
  'your-app-secret',
  {
    logLevel: LogLevel.Debug,           // Log level (default: Info)
    timeout: 30_000,                    // Request timeout in ms (default: 60000)
    disableEncryption: true,            // Disable request encryption (default: false)
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

## Links

- [Website](https://feihanim.cn/)

## License

[Apache-2.0 License](LICENSE)
