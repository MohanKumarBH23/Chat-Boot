import { IncomingMessage, ServerResponse } from 'node:http';
import { AppError, MethodNotAllowedError } from '../security/errors.js';

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  pathname: string;
  params: Record<string, string>;
  query: URLSearchParams;
  isHttps: boolean;
  clientIp: string;
}

export type RouteHandler = (ctx: RequestContext) => Promise<void> | void;

interface CompiledRoute {
  method: string;
  pattern: string;
  paramNames: string[];
  regex: RegExp;
  handler: RouteHandler;
}

function compilePattern(pattern: string): { paramNames: string[]; regex: RegExp } {
  const paramNames: string[] = [];
  const escapedParts = pattern.split('/').map((segment) => {
    if (segment.startsWith(':') && segment.length > 1) {
      paramNames.push(segment.slice(1));
      return '([^/]+)';
    }
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return {
    paramNames,
    regex: new RegExp(`^${escapedParts.join('/')}$`),
  };
}

/**
 * Normalizes optional versioned prefix `/api/v1/...` -> `/api/...` so versioned and
 * unversioned API paths share handlers seamlessly without duplication.
 */
export function normalizeApiPath(pathname: string): string {
  if (pathname === '/api/v1') return '/api';
  if (pathname.startsWith('/api/v1/')) {
    return `/api/${pathname.slice('/api/v1/'.length)}`;
  }
  return pathname;
}

export function writeJsonError(
  res: ServerResponse,
  status: number,
  message: string,
  code: string,
  extraHeaders?: Record<string, string>
): void {
  if (res.writableEnded || res.headersSent) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(extraHeaders || {}),
  });
  res.end(JSON.stringify({ error: message, code }));
}

/**
 * Lightweight, dependency-free HTTP router supporting path parameters, API version
 * normalization, 405 Method Not Allowed detection, and centralized error formatting.
 */
export class ApiRouter {
  private readonly routes: CompiledRoute[] = [];

  register(method: string, pattern: string, handler: RouteHandler): this {
    const { paramNames, regex } = compilePattern(pattern);
    this.routes.push({
      method: method.toUpperCase(),
      pattern,
      paramNames,
      regex,
      handler,
    });
    return this;
  }

  get(pattern: string, handler: RouteHandler): this {
    return this.register('GET', pattern, handler);
  }

  post(pattern: string, handler: RouteHandler): this {
    return this.register('POST', pattern, handler);
  }

  delete(pattern: string, handler: RouteHandler): this {
    return this.register('DELETE', pattern, handler);
  }

  async dispatch(baseCtx: Omit<RequestContext, 'params'>): Promise<boolean> {
    const normalizedPath = normalizeApiPath(baseCtx.pathname);
    const allowedForPath: string[] = [];

    for (const route of this.routes) {
      const match = normalizedPath.match(route.regex);
      if (!match) continue;
      allowedForPath.push(route.method);
      if (route.method !== baseCtx.method) continue;

      const params: Record<string, string> = {};
      for (let i = 0; i < route.paramNames.length; i++) {
        params[route.paramNames[i]] = match[i + 1];
      }

      await route.handler({ ...baseCtx, pathname: normalizedPath, params });
      return true;
    }

    if (allowedForPath.length > 0) {
      throw new MethodNotAllowedError([...new Set(allowedForPath)]);
    }

    return false;
  }

  handleError(res: ServerResponse, err: unknown, isProduction: boolean): void {
    if (err instanceof MethodNotAllowedError) {
      writeJsonError(res, err.statusCode, err.message, err.code, {
        Allow: err.allowedMethods.join(', '),
      });
      return;
    }
    if (err instanceof AppError) {
      writeJsonError(
        res,
        err.statusCode,
        err.expose ? err.message : 'Request failed',
        err.code
      );
      return;
    }

    const errName = err instanceof Error ? err.name : 'UnknownError';
    const detail = !isProduction && err instanceof Error ? `: ${err.message}` : '';
    console.error(`[ServerError] ${errName}${detail}`);
    writeJsonError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

