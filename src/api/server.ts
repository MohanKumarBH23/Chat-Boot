import http, { IncomingMessage, ServerResponse } from 'node:http';
import { AppConfig, AppConfigOverrides, deriveAuthStorePath, loadAppConfig } from '../config/env.js';
import { ValidationError } from '../security/errors.js';
import {
  RateLimiter,
  applySecurityHeaders,
  evaluateCorsAndOrigin,
  getClientIp,
  isRequestHttps,
} from '../security/httpSecurity.js';
import { SearchAgent } from '../services/agent/searchAgent.js';
import { createSearchClient } from '../services/search/index.js';
import { AuthStore } from '../storage/authStore.js';
import { MemoryStore } from '../storage/memoryStore.js';
import { seedUserStarterConversations } from '../storage/seed.js';
import { SearchProviderName } from '../types/index.js';
import { ApiDependencies, enforceRateLimit, sendJson } from './helpers.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerConversationRoutes } from './routes/conversations.js';
import { registerHealthRoutes } from './routes/health.js';
import { ApiRouter } from './router.js';
import { resolveUiDir, serveStatic } from './staticServer.js';

export interface CreateAppServerOptions {
  port?: number;
  config?: AppConfig;
  configOverrides?: AppConfigOverrides;
  memoryStore?: MemoryStore;
  authStore?: AuthStore;
  persistAuth?: boolean;
  searchProvider?: SearchProviderName;
  simulatedDate?: Date;
  rateLimiter?: RateLimiter;
}

/**
 * Application composition root constructing dependency-injected storage, search,
 * agent, authentication, rate limiting, and HTTP routing components.
 */
export function createAppServer(options?: CreateAppServerOptions) {
  const config =
    options?.config ??
    loadAppConfig({
      port: options?.port,
      searchProvider: options?.searchProvider,
      ...(options?.memoryStore
        ? {
            storagePath: options.memoryStore.filePath,
            authStoragePath: deriveAuthStorePath(options.memoryStore.filePath),
          }
        : {}),
      ...(options?.configOverrides || {}),
    });

  const memoryStore =
    options?.memoryStore ??
    new MemoryStore(config.storagePath, true, config.storageEncryptionKey);

  const authStore =
    options?.authStore ??
    new AuthStore(config.authStoragePath, {
      persist: options?.persistAuth ?? true,
      sessionSecret: config.sessionSecret,
      encryptionKey: config.storageEncryptionKey,
      sessionTtlMs: config.sessionTtlMs,
    });

  const rateLimiter = options?.rateLimiter ?? new RateLimiter();
  const searchClient = createSearchClient({
    provider: config.searchProvider,
    tavilyApiKey: config.tavilyApiKey,
    braveApiKey: config.braveApiKey,
  });

  const agent = new SearchAgent({
    searchClient,
    memoryStore,
    openaiApiKey: config.openaiApiKey,
    model: config.openaiModel,
    simulatedDate: options?.simulatedDate,
  });

  const deps: ApiDependencies = {
    config,
    memoryStore,
    authStore,
    searchClient,
    agent,
    rateLimiter,
  };

  const router = new ApiRouter();
  registerHealthRoutes(router, deps);
  registerAuthRoutes(router, deps);
  registerConversationRoutes(router, deps);
  registerAdminRoutes(router, deps);

  const uiDir = resolveUiDir();

  const readyPromise = (async () => {
    const provisioned = await authStore.ensureAdminFromEnv(
      config.adminUsername,
      config.adminPassword
    );
    if (provisioned) {
      seedUserStarterConversations(memoryStore, provisioned.id);
    }
  })();

  const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    await readyPromise;

    const method = (req.method || 'GET').toUpperCase();
    const isHttps = isRequestHttps(req, config);
    const clientIp = getClientIp(req, config);

    applySecurityHeaders(res, isHttps);

    try {
      let url: URL;
      try {
        url = new URL(req.url || '/', 'http://localhost');
      } catch {
        throw new ValidationError('Malformed request URL');
      }

      const cors = evaluateCorsAndOrigin(req, res, config, isHttps);
      if (!cors.allowed) {
        sendJson(res, 403, { error: 'Origin not allowed', code: 'CORS_ORIGIN_FORBIDDEN' });
        return;
      }
      if (cors.isPreflight) {
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }

      const pathname = url.pathname;

      if (pathname.startsWith('/api/')) {
        enforceRateLimit(res, rateLimiter, `api:${clientIp}`, 120, 60_000);
        const handled = await router.dispatch({
          req,
          res,
          method,
          pathname,
          query: url.searchParams,
          isHttps,
          clientIp,
        });
        if (!handled) {
          sendJson(res, 404, { error: 'Not found', code: 'NOT_FOUND' });
        }
        return;
      }

      if (method === 'GET' || method === 'HEAD') {
        serveStatic(res, uiDir, pathname);
        return;
      }

      sendJson(res, 404, { error: 'Not found', code: 'NOT_FOUND' });
    } catch (err) {
      router.handleError(res, err, config.isProduction);
    }
  };

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;

  return { server, handleRequest, agent, memoryStore, authStore, config, readyPromise };
}

const isEntrypoint =
  process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');

if (isEntrypoint) {
  const config = loadAppConfig();
  if (config.sessionSecretEphemeral && config.isProduction) {
    console.warn(
      '[Security] SESSION_SECRET is not set in .env; generated an ephemeral runtime secret (sessions reset on restart).'
    );
  }
  const { server, readyPromise } = createAppServer({ config });

  const shutdown = (signal: string) => {
    console.log(`[Server] Received ${signal}, closing HTTP server gracefully...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  void readyPromise.then(() => {
    server.listen(config.port, () => {
      console.log(`DeltaCheck listening on http://localhost:${config.port}`);
    });
  });
}

