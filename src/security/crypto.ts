import crypto from 'node:crypto';
import { ConfigurationError } from './errors.js';

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

interface EncryptedEnvelope {
  v: 1;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
}

/**
 * Parses JSON while stripping prototype-pollution keys (__proto__, constructor, prototype).
 */
export function safeJsonParse<T>(raw: string): T {
  return JSON.parse(raw, (key, value) => {
    if (RESERVED_KEYS.has(key)) {
      return undefined;
    }
    return value;
  }) as T;
}

/**
 * Encrypts a UTF-8 JSON payload using authenticated AES-256-GCM.
 */
export function encryptStoragePayload(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope: EncryptedEnvelope = {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
  return JSON.stringify(envelope);
}

/**
 * Decrypts AES-256-GCM envelopes when encountered; fails loudly if key is missing or invalid.
 */
export function decryptStoragePayload(rawFileText: string, key: Buffer | null): string {
  const trimmed = rawFileText.trim();
  if (!trimmed) return '[]';

  if (trimmed.startsWith('{')) {
    const parsed = safeJsonParse<Partial<EncryptedEnvelope>>(trimmed);
    if (
      parsed &&
      parsed.alg === 'aes-256-gcm' &&
      parsed.v === 1 &&
      typeof parsed.iv === 'string' &&
      typeof parsed.tag === 'string' &&
      typeof parsed.data === 'string'
    ) {
      if (!key) {
        throw new ConfigurationError(
          'Encrypted store detected; set matching DATA_ENCRYPTION_KEY to unlock'
        );
      }
      try {
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(parsed.iv, 'base64')
        );
        decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
        const decrypted = Buffer.concat([
          decipher.update(Buffer.from(parsed.data, 'base64')),
          decipher.final(),
        ]);
        return decrypted.toString('utf8');
      } catch (err) {
        throw new ConfigurationError('Failed to decrypt store payload (invalid key or corrupted data)', err);
      }
    }
  }

  return rawFileText;
}

/**
 * Constant-time UTF-8 string comparison for CSRF tokens and digests.
 */
export function safeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

