import { IncomingMessage, ServerResponse } from 'node:http';

export interface HttpNetworkPolicy {
  cookieSecure: boolean;
  trustProxy: boolean;
  corsAllowedOrigins: string[];
}

export function isRequestHttps(
  req: IncomingMessage,
  policy: Pick<HttpNetworkPolicy, 'cookieSecure' | 'trustProxy'>
): boolean {
  if (policy.cookieSecure) return true;
  if (policy.trustProxy) {
    const xfProto = req.headers?.['x-forwarded-proto'];
    if (typeof xfProto === 'string' && xfProto.split(',')[0].trim().toLowerCase() === 'https') {
      return true;
    }
  }
  const encrypted = (req.socket as { encrypted?: boolean } | undefined)?.encrypted;
  return Boolean(encrypted);
}

export function getClientIp(
  req: IncomingMessage,
  policy: Pick<HttpNetworkPolicy, 'trustProxy'>
): string {
  if (policy.trustProxy) {
    const xff = req.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      return xff.split(',')[0].trim();
    }
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

export function applySecurityHeaders(res: ServerResponse, isHttps: boolean): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
  );
  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

export function evaluateCorsAndOrigin(
  req: IncomingMessage,
  res: ServerResponse,
  policy: Pick<HttpNetworkPolicy, 'corsAllowedOrigins'>,
  isHttps: boolean
): { allowed: boolean; isPreflight: boolean } {
  const originHeader = req.headers?.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  const method = (req.method || 'GET').toUpperCase();

  if (!origin) {
    return { allowed: true, isPreflight: method === 'OPTIONS' };
  }

  res.setHeader('Vary', 'Origin');

  const hostHeader = req.headers?.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const scheme = isHttps ? 'https' : 'http';
  const expectedSelfOrigin = host ? `${scheme}://${host}` : '';

  const isSameOrigin = Boolean(host) && origin === expectedSelfOrigin;
  const isAllowlisted = policy.corsAllowedOrigins.includes(origin);

  if (!isSameOrigin && !isAllowlisted) {
    return { allowed: false, isPreflight: method === 'OPTIONS' };
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  res.setHeader('Access-Control-Max-Age', '600');

  return { allowed: true, isPreflight: method === 'OPTIONS' };
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtSec: number;
  retryAfterSec: number;
}

interface BucketEntry {
  count: number;
  resetAtMs: number;
}

/**
 * In-memory fixed-window rate limiter with bounded bucket eviction.
 */
export class RateLimiter {
  private buckets: Map<string, BucketEntry> = new Map();
  private readonly maxKeys = 10_000;

  check(key: string, limit: number, windowMs: number, nowMs = Date.now()): RateLimitResult {
    if (this.buckets.size >= this.maxKeys) {
      this.prune(nowMs);
    }

    const existing = this.buckets.get(key);
    if (!existing || nowMs >= existing.resetAtMs) {
      const resetAtMs = nowMs + windowMs;
      this.buckets.set(key, { count: 1, resetAtMs });
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - 1),
        resetAtSec: Math.ceil(resetAtMs / 1000),
        retryAfterSec: Math.ceil(windowMs / 1000),
      };
    }

    existing.count += 1;
    const allowed = existing.count <= limit;
    const remaining = Math.max(0, limit - existing.count);
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000));
    return {
      allowed,
      limit,
      remaining,
      resetAtSec: Math.ceil(existing.resetAtMs / 1000),
      retryAfterSec,
    };
  }

  private prune(nowMs: number): void {
    for (const [k, v] of this.buckets.entries()) {
      if (nowMs >= v.resetAtMs) {
        this.buckets.delete(k);
      }
    }
    if (this.buckets.size >= this.maxKeys) {
      this.buckets.clear();
    }
  }
}

export function applyRateLimitHeaders(res: ServerResponse, result: RateLimitResult): void {
  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(result.resetAtSec));
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.retryAfterSec));
  }
}

