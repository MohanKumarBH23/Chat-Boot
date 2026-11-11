import crypto from 'node:crypto';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../security/errors.js';
import {
  resolveSafeStoragePath,
  validatePasswordStrength,
  validateUsername,
} from '../security/validation.js';
import { PublicUser, SessionRecord, UserRecord, UserRole } from '../types/index.js';
import { readEncryptedJsonFile, writeEncryptedJsonFile } from './jsonPersistence.js';

export const SESSION_COOKIE_NAME = 'dc_session';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 32 * 1024 * 1024;
const MAX_SESSIONS_PER_USER = 20;
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface PersistedAuthData {
  users: UserRecord[];
  sessions: SessionRecord[];
}

export interface AuthStoreOptions {
  persist?: boolean;
  sessionSecret: string;
  encryptionKey?: Buffer | null;
  sessionTtlMs?: number;
}

function scryptAsync(password: string, saltHex: string, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      Buffer.from(saltHex, 'hex'),
      SCRYPT_KEYLEN,
      { N: n, r, p, maxmem: SCRYPT_MAXMEM },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      }
    );
  });
}

/**
 * Hashes a plaintext password using salted scrypt (N=16384, r=8, p=1).
 */
export async function hashPassword(password: string): Promise<string> {
  const saltHex = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, saltHex, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${saltHex}$${derived.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored scrypt digest in constant time.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number.parseInt(parts[1], 10);
  const r = Number.parseInt(parts[2], 10);
  const p = Number.parseInt(parts[3], 10);
  const saltHex = parts[4];
  const expectedHex = parts[5];

  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    n < 1024 ||
    n > 65536 ||
    !/^[0-9a-f]+$/i.test(saltHex) ||
    !/^[0-9a-f]+$/i.test(expectedHex)
  ) {
    return false;
  }

  try {
    const derived = await scryptAsync(password, saltHex, n, r, p);
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | null = null;
function getDummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(crypto.randomBytes(24).toString('hex'));
  }
  return dummyHashPromise;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const rawName = part.slice(0, eqIdx).trim();
    const rawVal = part.slice(eqIdx + 1).trim();
    if (!rawName) continue;
    try {
      cookies[rawName] = decodeURIComponent(rawVal);
    } catch {
      cookies[rawName] = rawVal;
    }
  }
  return cookies;
}

export function buildSessionCookie(token: string, maxAgeSec: number, isHttps: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`,
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearSessionCookie(isHttps: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    'Max-Age=0',
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/**
 * Credential and HMAC-hashed session repository backed by encrypted JSON persistence.
 */
export class AuthStore {
  public readonly filePath: string;
  private readonly persist: boolean;
  private readonly sessionSecret: string;
  private readonly encryptionKey: Buffer | null;
  private readonly sessionTtlMs: number;
  private users: Map<string, UserRecord> = new Map();
  private sessions: Map<string, SessionRecord> = new Map();

  constructor(customPath: string | undefined, options: AuthStoreOptions) {
    this.filePath = resolveSafeStoragePath(customPath, './data/auth_store.json');
    this.persist = options.persist !== false;
    this.sessionSecret = options.sessionSecret;
    this.encryptionKey = options.encryptionKey ?? null;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;

    if (this.persist) {
      this.load();
    }
  }

  private hashToken(rawToken: string): string {
    return crypto.createHmac('sha256', this.sessionSecret).update(rawToken).digest('hex');
  }

  private load(): void {
    const parsed = readEncryptedJsonFile<Partial<PersistedAuthData>>(
      this.filePath,
      this.encryptionKey
    );
    if (!parsed) return;

    if (Array.isArray(parsed.users)) {
      for (const u of parsed.users) {
        if (u && typeof u.id === 'string' && typeof u.username === 'string' && typeof u.passwordHash === 'string') {
          this.users.set(u.id, {
            id: u.id,
            username: u.username,
            role: u.role === 'admin' ? 'admin' : 'user',
            passwordHash: u.passwordHash,
            createdAt: typeof u.createdAt === 'string' ? u.createdAt : new Date().toISOString(),
          });
        }
      }
    }

    const now = Date.now();
    if (Array.isArray(parsed.sessions)) {
      for (const s of parsed.sessions) {
        if (
          s &&
          typeof s.tokenHash === 'string' &&
          typeof s.userId === 'string' &&
          typeof s.csrfToken === 'string' &&
          typeof s.expiresAt === 'number' &&
          s.expiresAt > now &&
          this.users.has(s.userId)
        ) {
          this.sessions.set(s.tokenHash, s);
        }
      }
    }
  }

  private save(): void {
    if (!this.persist) return;
    const payload: PersistedAuthData = {
      users: Array.from(this.users.values()),
      sessions: Array.from(this.sessions.values()),
    };
    writeEncryptedJsonFile(this.filePath, payload, this.encryptionKey);
  }

  hasAnyUsers(): boolean {
    return this.users.size > 0;
  }

  hasAdmin(): boolean {
    for (const u of this.users.values()) {
      if (u.role === 'admin') return true;
    }
    return false;
  }

  getUserCount(): number {
    return this.users.size;
  }

  getActiveSessionCount(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(key);
      } else {
        count += 1;
      }
    }
    return count;
  }

  listUsers(): PublicUser[] {
    return Array.from(this.users.values())
      .map(toPublicUser)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getUserById(id: string): PublicUser | undefined {
    const u = this.users.get(id);
    return u ? toPublicUser(u) : undefined;
  }

  private findUserRecordByUsername(username: string): UserRecord | undefined {
    const target = username.trim().toLowerCase();
    for (const u of this.users.values()) {
      if (u.username.toLowerCase() === target) {
        return u;
      }
    }
    return undefined;
  }

  private async createUserInternal(username: string, password: string, role: UserRole): Promise<PublicUser> {
    if (!validateUsername(username)) {
      throw new ValidationError('Username must be 3-32 characters (letters, numbers, ., _, -)');
    }
    const cleanUsername = username.trim();
    const pwErr = validatePasswordStrength(password);
    if (pwErr) {
      throw new ValidationError(pwErr);
    }
    if (this.findUserRecordByUsername(cleanUsername)) {
      throw new ConflictError('Username is already taken');
    }

    const passwordHash = await hashPassword(password);
    const user: UserRecord = {
      id: `usr_${crypto.randomUUID()}`,
      username: cleanUsername,
      role,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    this.save();
    return toPublicUser(user);
  }

  /**
   * One-time administrator setup permitted strictly when zero accounts exist.
   */
  async bootstrapAdmin(username: string, password: string): Promise<PublicUser> {
    if (this.hasAnyUsers()) {
      throw new AuthorizationError('Initial setup has already been completed');
    }
    return this.createUserInternal(username, password, 'admin');
  }

  async ensureAdminFromEnv(username: string, password: string): Promise<PublicUser | null> {
    if (!username || !password || this.hasAdmin()) return null;
    return this.createUserInternal(username, password, 'admin');
  }

  /**
   * Registers a standard researcher account with role permanently locked to 'user'.
   */
  async registerUser(username: string, password: string): Promise<PublicUser> {
    return this.createUserInternal(username, password, 'user');
  }

  async authenticate(username: string, password: string): Promise<PublicUser | null> {
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return null;
    }
    const record = this.findUserRecordByUsername(username);
    if (!record) {
      await verifyPassword(password, await getDummyPasswordHash());
      return null;
    }
    const ok = await verifyPassword(password, record.passwordHash);
    return ok ? toPublicUser(record) : null;
  }

  createSession(userId: string): { rawToken: string; session: SessionRecord } {
    if (!this.users.has(userId)) {
      throw new NotFoundError('User not found');
    }

    const now = Date.now();
    for (const [k, s] of this.sessions.entries()) {
      if (s.expiresAt <= now) {
        this.sessions.delete(k);
      }
    }

    const userSessions = Array.from(this.sessions.values())
      .filter((s) => s.userId === userId)
      .sort((a, b) => a.createdAt - b.createdAt);
    while (userSessions.length >= MAX_SESSIONS_PER_USER) {
      const oldest = userSessions.shift();
      if (oldest) {
        this.sessions.delete(oldest.tokenHash);
      }
    }

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const csrfToken = crypto.randomBytes(24).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const session: SessionRecord = {
      tokenHash,
      userId,
      csrfToken,
      createdAt: now,
      expiresAt: now + this.sessionTtlMs,
    };
    this.sessions.set(tokenHash, session);
    this.save();
    return { rawToken, session };
  }

  getSessionFromToken(rawToken: string): { user: PublicUser; session: SessionRecord } | null {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const tokenHash = this.hashToken(rawToken);
    const session = this.sessions.get(tokenHash);
    if (!session) return null;

    if (Date.now() >= session.expiresAt) {
      this.sessions.delete(tokenHash);
      this.save();
      return null;
    }

    const user = this.users.get(session.userId);
    if (!user) {
      this.sessions.delete(tokenHash);
      this.save();
      return null;
    }

    return { user: toPublicUser(user), session };
  }

  revokeSession(rawToken: string): boolean {
    if (!rawToken) return false;
    const tokenHash = this.hashToken(rawToken);
    const deleted = this.sessions.delete(tokenHash);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  revokeUserSessions(userId: string): number {
    let removed = 0;
    for (const [k, s] of this.sessions.entries()) {
      if (s.userId === userId) {
        this.sessions.delete(k);
        removed += 1;
      }
    }
    if (removed > 0) {
      this.save();
    }
    return removed;
  }

  deleteUser(userId: string): boolean {
    const target = this.users.get(userId);
    if (!target) return false;

    if (target.role === 'admin') {
      const adminCount = Array.from(this.users.values()).filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) {
        throw new ValidationError('Cannot delete the only administrator account');
      }
    }

    this.revokeUserSessions(userId);
    const deleted = this.users.delete(userId);
    if (deleted) {
      this.save();
    }
    return deleted;
  }
}

