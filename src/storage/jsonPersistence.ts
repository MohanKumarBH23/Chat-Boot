import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { decryptStoragePayload, encryptStoragePayload, safeJsonParse } from '../security/crypto.js';
import { ConfigurationError } from '../security/errors.js';

/**
 * Ensures the parent directory for a storage file exists with restrictive 0o700 permissions.
 */
export function ensurePrivateDirectory(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Atomically serializes JSON state with optional AES-256-GCM encryption and 0o600 permissions.
 */
export function writeEncryptedJsonFile(
  filePath: string,
  data: unknown,
  encryptionKey: Buffer | null
): void {
  ensurePrivateDirectory(filePath);
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;

  try {
    const json = JSON.stringify(data, null, 2);
    const content = encryptionKey ? encryptStoragePayload(json, encryptionKey) : json;
    fs.writeFileSync(tmpPath, content, { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Windows NTFS enforces ACLs cleanly without POSIX chmod
    }
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore best-effort temp file cleanup
      }
    }
    throw new ConfigurationError(`Failed to persist store file "${path.basename(filePath)}"`, err);
  }
}

/**
 * Reads JSON storage state, decrypting AES-256-GCM envelopes when present and stripping
 * prototype-pollution keys. Returns null when the file does not exist or is blank.
 */
export function readEncryptedJsonFile<T>(
  filePath: string,
  encryptionKey: Buffer | null
): T | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) return null;

  const decrypted = decryptStoragePayload(raw, encryptionKey);
  try {
    return safeJsonParse<T>(decrypted);
  } catch (err) {
    console.warn(
      `[Storage] Failed to parse JSON store (${path.basename(filePath)}):`,
      (err as Error).message
    );
    return null;
  }
}

