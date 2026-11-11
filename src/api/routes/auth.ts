import { AuthenticationError, AuthorizationError } from '../../security/errors.js';
import { readSafeJsonBody } from '../../security/validation.js';
import {
  SESSION_COOKIE_NAME,
  buildClearSessionCookie,
  buildSessionCookie,
  parseCookies,
} from '../../storage/authStore.js';
import { seedUserStarterConversations } from '../../storage/seed.js';
import {
  ApiDependencies,
  assertNotCrossSite,
  enforceRateLimit,
  getOptionalAuth,
  requireAuth,
  requireCsrf,
  sendJson,
} from '../helpers.js';
import { ApiRouter } from '../router.js';

const AUTH_MAX_REQUESTS = 10;
const AUTH_WINDOW_MS = 15 * 60_000;

/**
 * Registers authentication, initial admin bootstrap, registration, and session logout endpoints.
 */
export function registerAuthRoutes(router: ApiRouter, deps: ApiDependencies): void {
  const maxAgeSec = Math.floor(deps.config.sessionTtlMs / 1000);

  router.get('/api/auth/me', ({ req, res, isHttps }) => {
    const cookies = parseCookies(req.headers?.cookie);
    const hasCookie = Boolean(cookies[SESSION_COOKIE_NAME]);
    const auth = getOptionalAuth(req, deps.authStore);
    const setupRequired = !deps.authStore.hasAnyUsers();

    if (!auth) {
      const headers: Record<string, string> = {};
      if (hasCookie) {
        headers['Set-Cookie'] = buildClearSessionCookie(isHttps);
      }
      sendJson(
        res,
        200,
        {
          authenticated: false,
          setupRequired,
          registrationEnabled: deps.config.allowRegistration && !setupRequired,
          user: null,
          csrfToken: null,
        },
        headers
      );
      return;
    }

    sendJson(res, 200, {
      authenticated: true,
      setupRequired: false,
      registrationEnabled: deps.config.allowRegistration,
      user: auth.user,
      csrfToken: auth.session.csrfToken,
      capabilities: {
        llmConfigured: deps.agent.isLlmConfigured,
      },
    });
  });

  router.post('/api/auth/bootstrap', async ({ req, res, clientIp, isHttps }) => {
    assertNotCrossSite(req);
    enforceRateLimit(
      res,
      deps.rateLimiter,
      `auth:${clientIp}`,
      AUTH_MAX_REQUESTS,
      AUTH_WINDOW_MS,
      'Too many authentication attempts. Please wait before retrying.'
    );

    const body = await readSafeJsonBody(req, 8 * 1024);
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const admin = await deps.authStore.bootstrapAdmin(username, password);
    seedUserStarterConversations(deps.memoryStore, admin.id);
    const { rawToken, session } = deps.authStore.createSession(admin.id);

    sendJson(
      res,
      201,
      { user: admin, csrfToken: session.csrfToken },
      { 'Set-Cookie': buildSessionCookie(rawToken, maxAgeSec, isHttps) }
    );
  });

  router.post('/api/auth/register', async ({ req, res, clientIp, isHttps }) => {
    assertNotCrossSite(req);
    enforceRateLimit(
      res,
      deps.rateLimiter,
      `auth:${clientIp}`,
      AUTH_MAX_REQUESTS,
      AUTH_WINDOW_MS,
      'Too many authentication attempts. Please wait before retrying.'
    );

    if (!deps.authStore.hasAnyUsers()) {
      throw new AuthorizationError('Initial administrator setup must be completed first');
    }
    if (!deps.config.allowRegistration) {
      throw new AuthorizationError('Public registration is disabled by the administrator');
    }

    const body = await readSafeJsonBody(req, 8 * 1024);
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const user = await deps.authStore.registerUser(username, password);
    seedUserStarterConversations(deps.memoryStore, user.id);
    const { rawToken, session } = deps.authStore.createSession(user.id);

    sendJson(
      res,
      201,
      { user, csrfToken: session.csrfToken },
      { 'Set-Cookie': buildSessionCookie(rawToken, maxAgeSec, isHttps) }
    );
  });

  router.post('/api/auth/login', async ({ req, res, clientIp, isHttps }) => {
    assertNotCrossSite(req);
    enforceRateLimit(
      res,
      deps.rateLimiter,
      `auth:${clientIp}`,
      AUTH_MAX_REQUESTS,
      AUTH_WINDOW_MS,
      'Too many authentication attempts. Please wait before retrying.'
    );

    const body = await readSafeJsonBody(req, 8 * 1024);
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const user = await deps.authStore.authenticate(username, password);
    if (!user) {
      throw new AuthenticationError('Invalid username or password', 'INVALID_CREDENTIALS');
    }

    const { rawToken, session } = deps.authStore.createSession(user.id);
    sendJson(
      res,
      200,
      { user, csrfToken: session.csrfToken },
      { 'Set-Cookie': buildSessionCookie(rawToken, maxAgeSec, isHttps) }
    );
  });

  router.post('/api/auth/logout', ({ req, res, isHttps }) => {
    const auth = requireAuth(req, deps.authStore);
    requireCsrf(req, auth.session);
    deps.authStore.revokeSession(auth.rawToken);
    sendJson(res, 200, { success: true }, { 'Set-Cookie': buildClearSessionCookie(isHttps) });
  });
}

