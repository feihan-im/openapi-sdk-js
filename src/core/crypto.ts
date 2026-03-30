// Copyright (c) 2026 上海飞函安全科技有限公司 (Shanghai Feihan Security Technology Co., Ltd.)
// SPDX-License-Identifier: Apache-2.0

import type { Config } from './config';
import type { SecureMessage } from '@/internal/transport';
import { DEFAULT_SECURE_VERSION } from './consts';

const ALPHANUMERIC = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class CryptoManager {
  private config: Config;
  private prefix: string;
  private counter: number[] = [0, 0, 0, 0, 0];

  constructor(config: Config) {
    this.config = config;
    this.prefix = randomAlphanumeric(6);
  }

  async encryptMessage(secret: string, data: Uint8Array): Promise<SecureMessage> {
    const timestamp = this.config.timeManager.getServerTimestamp();
    const nonce = this.getNonce();

    // Derive initKey = SHA256(timestamp:secret:nonce)
    const initKey = await sha256Bytes(`${timestamp}:${secret}:${nonce}`);

    // Generate random AES key
    const aesKey = randomBytes(32);

    // Compress data with gzip
    const compressed = await compressGzip(data);

    // Encrypt AES key with initKey
    const encryptedKey = await encryptAES256CBC(aesKey, initKey);

    // Encrypt compressed data with AES key
    const encryptedData = await encryptAES256CBC(compressed, aesKey);

    return {
      version: DEFAULT_SECURE_VERSION,
      timestamp,
      nonce,
      encryptedKey,
      encryptedData,
    };
  }

  async decryptMessage(secret: string, message: SecureMessage): Promise<Uint8Array> {
    if (message.version !== DEFAULT_SECURE_VERSION) {
      throw new Error(`unsupported secure message version: ${message.version}`);
    }

    // Derive initKey
    const initKey = await sha256Bytes(`${message.timestamp}:${secret}:${message.nonce}`);

    // Decrypt AES key
    const aesKey = await decryptAES256CBC(message.encryptedKey, initKey);

    // Decrypt data
    const compressed = await decryptAES256CBC(message.encryptedData, aesKey);

    // Decompress
    return await decompressGzip(compressed);
  }

  private getNonce(): string {
    const random = randomAlphanumeric(5);
    const counter = this.formatCounter();
    this.addCounter();
    return this.prefix + random + counter;
  }

  private formatCounter(): string {
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += ALPHANUMERIC[this.counter[i]];
    }
    return result;
  }

  private addCounter(): void {
    for (let i = 4; i >= 0; i--) {
      this.counter[i]++;
      if (this.counter[i] < 62) {
        break;
      }
      this.counter[i] = 0;
    }
  }
}

// --- Crypto helpers using Web Crypto API ---

async function sha256Bytes(input: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = await sha256Bytes(input);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function encryptAES256CBC(data: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
  // Web Crypto AES-CBC automatically applies PKCS7 padding, so no manual pad needed
  const iv = randomBytes(16);
  const cryptoKey = await crypto.subtle.importKey('raw', toBuffer(key), { name: 'AES-CBC' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: toBuffer(iv) }, cryptoKey, toBuffer(data));
  // Return IV + ciphertext
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  return result;
}

async function decryptAES256CBC(data: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
  if (data.length < 16 || data.length % 16 !== 0) {
    throw new Error('invalid encrypted data length');
  }
  const iv = data.slice(0, 16);
  const ciphertext = data.slice(16);
  const cryptoKey = await crypto.subtle.importKey('raw', toBuffer(key), { name: 'AES-CBC' }, false, ['decrypt']);
  // Web Crypto API handles PKCS7 unpadding automatically for AES-CBC
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: toBuffer(iv) }, cryptoKey, toBuffer(ciphertext));
  return new Uint8Array(decrypted);
}

// --- Compression ---

async function compressGzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'undefined') {
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    void writer.write(new Uint8Array(data));
    void writer.close();
    const chunks: Uint8Array[] = [];
    const reader = stream.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
  throw new Error('CompressionStream not available. Please use a modern browser or Node.js 18+.');
}

async function decompressGzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new DecompressionStream('gzip');
    const writer = stream.writable.getWriter();
    void writer.write(new Uint8Array(data));
    void writer.close();
    const chunks: Uint8Array[] = [];
    const reader = stream.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
  throw new Error('DecompressionStream not available. Please use a modern browser or Node.js 18+.');
}

// --- Buffer helpers ---

/** Convert Uint8Array to ArrayBuffer (fixes TS 5.5+ BufferSource strictness). */
function toBuffer(data: Uint8Array): ArrayBuffer {
  return (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength);
}

// --- Random helpers ---

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomAlphanumeric(size: number): string {
  const bytes = randomBytes(size);
  let result = '';
  for (let i = 0; i < size; i++) {
    result += ALPHANUMERIC[bytes[i] % 62];
  }
  return result;
}
