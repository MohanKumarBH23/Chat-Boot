import { IncomingMessage, ServerResponse } from 'node:http';
import { AppConfig } from '../config/env.js';
import { safeCompareStrings } from '../security/crypto.js';
import {
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  ValidationError,
} from '../security/errors.js';
import { RateLimiter, applyRateLimitHeaders } from '../security/httpSecurity.js';
import { SearchAgent } from '../services/agent/searchAgent.js';
import { AuthStore, SESSION_COOKIE_NAME, parseCookies } from '../storage/authStore.js';
import { MemoryStore } from '../storage/memoryStore.js';
import { ISearchClient, PublicUser, SessionRecord } from '../types/index.js';

export interface ApiDependencies {
  config: AppConfig;
  memoryStore: MemoryStore;
  authStore: AuthStore;
  searchClient: ISearchClient;
  agent: SearchAgent;
  rateLimiter: RateLimiter;
}

export interface AuthenticatedContext {
  user: PublicUser;
  session: SessionRecord;
  rawToken: string;
}

export function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  extraHeaders?: Record<string, string>
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(extraHeaders || {}),
  });
  res.end(JSON.stringify(payload));
}

export function enforceRateLimit(
  res: ServerResponse,
  limiter: RateLimiter,
  key: string,
  limit: number,
  windowMs: number,
  message?: string
): void {
  const result = limiter.check(key, limit, windowMs);
  applyRateLimitHeaders(res, result);
  if (!result.allowed) {
    throw new RateLimitError(message);
  }
}

export function assertNotCrossSite(req: IncomingMessage): void {
  const secFetchSite = req.headers?.['sec-fetch-site'];
  const siteVal = Array.isArray(secFetchSite) ? secFetchSite[0] : secFetchSite;
  if (typeof siteVal === 'string' && siteVal.toLowerCase() === 'cross-site') {
    throw new AuthorizationError('Cross-site state-changing requests are forbidden');
  }
}

export function getOptionalAuth(
  req: IncomingMessage,
  authStore: AuthStore
): AuthenticatedContext | null {
  const cookies = parseCookies(req.headers?.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken) return null;

  const found = authStore.getSessionFromToken(rawToken);
  if (!found) return null;

  return { user: found.user, session: found.session, rawToken };
}

export function requireAuth(req: IncomingMessage, authStore: AuthStore): AuthenticatedContext {
  const auth = getOptionalAuth(req, authStore);
  if (!auth) {
    throw new AuthenticationError();
  }
  return auth;
}

export function requireAdmin(user: PublicUser): void {
  if (user.role !== 'admin') {
    throw new AuthorizationError('Administrator privileges required');
  }
}

export function requireCsrf(req: IncomingMessage, session: SessionRecord): void {
  assertNotCrossSite(req);
  const headerVal = req.headers?.['x-csrf-token'];
  const token = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (typeof token !== 'string' || !token || !safeCompareStrings(token, session.csrfToken)) {
    throw new AuthorizationError('Invalid or missing CSRF token', 'INVALID_CSRF_TOKEN');
  }
}

export function parseParamId(
  rawParam: string | undefined,
  validator: (value: string) => boolean,
  label: string
): string {
  if (!rawParam) {
    throw new ValidationError(`Missing ${label}`);
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawParam);
  } catch {
    throw new ValidationError(`Invalid ${label}`);
  }
  if (!validator(decoded)) {
    throw new ValidationError(`Invalid ${label} format`);
  }
  return decoded;
}

