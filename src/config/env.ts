import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { ConfigurationError } from '../security/errors.js';
import {
  parseCorsOrigins,
  parseEncryptionKey,
  resolveSafeStoragePath,
  validatePasswordStrength,
  validateUsername,
} from '../security/validation.js';
import { EnvPresenceSummary, SearchProviderName } from '../types/index.js';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
export const DEFAULT_MAX_BODY_BYTES = 32 * 1024;

/**
 * Validated runtime configuration loaded from environment variables at startup.
 */
export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  sessionSecret: string;
  sessionSecretEphemeral: boolean;
  sessionTtlMs: number;
  storageEncryptionKey: Buffer | null;
  storagePath: string;
  authStoragePath: string;
  searchProvider: SearchProviderName;
  tavilyApiKey: string;
  braveApiKey: string;
  openaiApiKey: string;
  openaiModel: string;
  corsAllowedOrigins: string[];
  trustProxy: boolean;
  cookieSecure: boolean;
  allowRegistration: boolean;
  adminUsername: string;
  adminPassword: string;
  envStatus: EnvPresenceSummary;
}

export type AppConfigOverrides = Partial<{
  port: number;
  storagePath: string;
  authStoragePath: string;
  searchProvider: SearchProviderName;
  openaiApiKey: string;
  openaiModel: string;
  tavilyApiKey: string;
  braveApiKey: string;
  sessionSecret: string;
  storageEncryptionKey: Buffer | null;
  corsAllowedOrigins: string[];
  trustProxy: boolean;
  cookieSecure: boolean;
  allowRegistration: boolean;
  adminUsername: string;
  adminPassword: string;
  isProduction: boolean;
}>;

const REDACTED_ENV_KEYS = [
  'OPENAI_API_KEY',
  'TAVILY_API_KEY',
  'BRAVE_API_KEY',
  'SESSION_SECRET',
  'DATA_ENCRYPTION_KEY',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'CORS_ALLOWED_ORIGINS',
] as const;

export function deriveAuthStorePath(memoryStoragePath: string): string {
  const dir = path.dirname(path.resolve(memoryStoragePath));
  return resolveSafeStoragePath(path.join(dir, 'auth_store.json'));
}

export function normalizeSearchProvider(raw: string | undefined): SearchProviderName {
  const clean = (raw || 'tavily').trim().toLowerCase();
  if (clean === 'brave' || clean === 'mock' || clean === 'tavily') {
    return clean;
  }
  throw new ConfigurationError(`Unsupported SEARCH_PROVIDER "${clean}" (use tavily, brave, or mock)`);
}

export function buildRedactedEnvSummary(envSource: NodeJS.ProcessEnv): EnvPresenceSummary {
  const summary: EnvPresenceSummary = {};
  for (const key of REDACTED_ENV_KEYS) {
    const val = envSource[key];
    summary[key] = val && val.trim().length > 0 ? 'SET' : 'EMPTY';
  }
  return summary;
}

/**
 * Loads, validates, and freezes environment configuration once at the application boundary.
 */
export function loadAppConfig(
  overrides: AppConfigOverrides = {},
  envSource: NodeJS.ProcessEnv = process.env
): AppConfig {
  const nodeEnv = (envSource.NODE_ENV || 'production').toLowerCase().trim();
  const isProduction = overrides.isProduction ?? (nodeEnv !== 'development' && nodeEnv !== 'test');

  const port =
    overrides.port ?? (envSource.PORT ? Number.parseInt(envSource.PORT, 10) : 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigurationError('PORT must be an integer between 0 and 65535');
  }

  let sessionSecret = (overrides.sessionSecret ?? envSource.SESSION_SECRET ?? '').trim();
  let sessionSecretEphemeral = false;
  if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    sessionSecretEphemeral = true;
  } else if (sessionSecret.length < 32) {
    throw new ConfigurationError('SESSION_SECRET must be at least 32 characters long');
  }

  const storageEncryptionKey =
    overrides.storageEncryptionKey !== undefined
      ? overrides.storageEncryptionKey
      : parseEncryptionKey(envSource.DATA_ENCRYPTION_KEY);

  const storagePath = resolveSafeStoragePath(overrides.storagePath ?? envSource.STORAGE_PATH);
  const authStoragePath = overrides.authStoragePath
    ? resolveSafeStoragePath(overrides.authStoragePath)
    : deriveAuthStorePath(storagePath);

  const corsAllowedOrigins =
    overrides.corsAllowedOrigins ?? parseCorsOrigins(envSource.CORS_ALLOWED_ORIGINS);
  const trustProxy = overrides.trustProxy ?? envSource.TRUST_PROXY === 'true';
  const cookieSecure = overrides.cookieSecure ?? envSource.COOKIE_SECURE === 'true';
  const allowRegistration =
    overrides.allowRegistration ?? envSource.ALLOW_REGISTRATION !== 'false';

  const adminUsername = (overrides.adminUsername ?? envSource.ADMIN_USERNAME ?? '').trim();
  const adminPassword = overrides.adminPassword ?? envSource.ADMIN_PASSWORD ?? '';
  if (adminUsername || adminPassword) {
    if (!validateUsername(adminUsername)) {
      throw new ConfigurationError('ADMIN_USERNAME must be 3-32 alphanumeric/._- characters');
    }
    const pwErr = validatePasswordStrength(adminPassword);
    if (pwErr) {
      throw new ConfigurationError(`ADMIN_PASSWORD rejected: ${pwErr}`);
    }
  }

  return {
    nodeEnv,
    isProduction,
    port,
    sessionSecret,
    sessionSecretEphemeral,
    sessionTtlMs: SESSION_TTL_MS,
    storageEncryptionKey,
    storagePath,
    authStoragePath,
    searchProvider: overrides.searchProvider ?? normalizeSearchProvider(envSource.SEARCH_PROVIDER),
    tavilyApiKey: (overrides.tavilyApiKey ?? envSource.TAVILY_API_KEY ?? '').trim(),
    braveApiKey: (overrides.braveApiKey ?? envSource.BRAVE_API_KEY ?? '').trim(),
    openaiApiKey: (overrides.openaiApiKey ?? envSource.OPENAI_API_KEY ?? '').trim(),
    openaiModel: (overrides.openaiModel ?? envSource.OPENAI_MODEL ?? 'gpt-4o').trim() || 'gpt-4o',
    corsAllowedOrigins,
    trustProxy,
    cookieSecure,
    allowRegistration,
    adminUsername,
    adminPassword,
    envStatus: buildRedactedEnvSummary(envSource),
  };
}

