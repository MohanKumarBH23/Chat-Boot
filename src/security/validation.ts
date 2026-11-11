import { IncomingMessage } from 'node:http';
import path from 'node:path';
import { safeJsonParse } from './crypto.js';
import {
  ConfigurationError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  ValidationError,
} from './errors.js';

const RESERVED_IDENTIFIERS = new Set(['__proto__', 'constructor', 'prototype']);

const COMMON_WEAK_PASSWORDS = new Set([
  'password123',
  'password1234',
  '1234567890',
  '123456789012',
  'admin12345',
  'admin123456',
  'qwertyuiop',
  'qwerty1234',
  'letmein123',
  'changeme123',
  'deltacheck123',
]);

export function parseEncryptionKey(rawKey: string | undefined): Buffer | null {
  if (!rawKey || !rawKey.trim()) return null;
  const trimmed = rawKey.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  const b64 = Buffer.from(trimmed, 'base64');
  if (b64.length === 32) {
    return b64;
  }
  throw new ConfigurationError(
    'DATA_ENCRYPTION_KEY must be a 32-byte key (64 hex chars or 32-byte base64)'
  );
}

export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  const list: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed === '*') {
      throw new ConfigurationError(
        'CORS_ALLOWED_ORIGINS cannot contain wildcard "*" when credentials are enabled'
      );
    }
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ConfigurationError(`Invalid CORS origin protocol: ${trimmed}`);
    }
    list.push(parsed.origin);
  }
  return list;
}

/**
 * Validates and resolves storage file targets against dotfiles or source code overwrite.
 */
export function resolveSafeStoragePath(
  rawPath: string | undefined,
  fallbackRel = './data/agent_memory.json'
): string {
  const candidate = (rawPath || fallbackRel).trim();
  if (!candidate || candidate.includes('\0')) {
    throw new ConfigurationError('Invalid storage path configuration');
  }
  const resolved = path.resolve(candidate);
  const base = path.basename(resolved).toLowerCase();
  if (base.startsWith('.env') || base === 'package.json' || base === 'package-lock.json') {
    throw new ConfigurationError(`Refusing unsafe storage target: ${base}`);
  }
  const parts = resolved.split(path.sep).map((p) => p.toLowerCase());
  if (parts.includes('.git')) {
    throw new ConfigurationError('Refusing storage inside .git directory');
  }
  return resolved;
}

/**
 * Strips control/bidi override characters and enforces bounded length.
 */
export function sanitizeText(value: unknown, maxLength: number, allowNewlines = false): string {
  if (typeof value !== 'string') return '';
  let clean = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, '');
  if (!allowNewlines) {
    clean = clean.replace(/[\r\n\t]+/g, ' ');
  } else {
    clean = clean.replace(/\r\n/g, '\n');
  }
  return clean.trim().slice(0, maxLength);
}

export function validateConversationId(id: string): boolean {
  return !RESERVED_IDENTIFIERS.has(id) && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
}

export function validateUserId(id: string): boolean {
  return !RESERVED_IDENTIFIERS.has(id) && /^usr_[a-zA-Z0-9-]{8,64}$/.test(id);
}

export function validateUsername(username: unknown): username is string {
  if (typeof username !== 'string') return false;
  const clean = username.trim();
  if (RESERVED_IDENTIFIERS.has(clean.toLowerCase()) || clean.toLowerCase() === 'system-cli') {
    return false;
  }
  return /^[a-zA-Z0-9._-]{3,32}$/.test(clean);
}

export function validatePasswordStrength(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required';
  if (/[\u0000-\u001F\u007F]/.test(password)) {
    return 'Password cannot contain control characters';
  }
  if (password.length < 10) {
    return 'Password must be at least 10 characters long';
  }
  if (password.length > 128) {
    return 'Password cannot exceed 128 characters';
  }
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return 'Choose a less predictable password';
  }
  if (/(.)\1{7,}/.test(password)) {
    return 'Password contains too many repeated characters';
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classes < 2) {
    return 'Password must combine at least two character types (letters, numbers, symbols)';
  }
  return null;
}

export function isValidHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely reads bounded JSON object bodies while rejecting oversized payloads and non-JSON media types.
 */
export async function readSafeJsonBody(
  req: IncomingMessage,
  maxBytes = 32 * 1024
): Promise<Record<string, unknown>> {
  const ct = req.headers?.['content-type'];
  if (typeof ct === 'string' && !ct.toLowerCase().includes('application/json')) {
    throw new UnsupportedMediaTypeError('Content-Type must be application/json');
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new PayloadTooLargeError('Request body too large');
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  try {
    const parsed = safeJsonParse<unknown>(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ValidationError('JSON object body required');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('Malformed JSON request body');
  }
}

