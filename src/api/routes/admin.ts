import { NotFoundError, ValidationError } from '../../security/errors.js';
import { readSafeJsonBody, sanitizeText, validateUserId } from '../../security/validation.js';
import { seedUserStarterConversations } from '../../storage/seed.js';
import {
  ApiDependencies,
  enforceRateLimit,
  parseParamId,
  requireAdmin,
  requireAuth,
  requireCsrf,
  sendJson,
} from '../helpers.js';
import { ApiRouter } from '../router.js';

/**
 * Registers role-gated administrator diagnostics, account lifecycle, seed, and raw search routes.
 */
export function registerAdminRoutes(router: ApiRouter, deps: ApiDependencies): void {
  router.get('/api/admin/overview', ({ req, res }) => {
    const auth = requireAuth(req, deps.authStore);
    requireAdmin(auth.user);

    sendJson(res, 200, {
      nodeEnv: deps.config.isProduction ? 'production' : deps.config.nodeEnv,
      searchProvider: deps.agent.searchProviderName,
      llmConfigured: deps.agent.isLlmConfigured,
      model: deps.agent.modelName,
      encryptionAtRestEnabled: Boolean(deps.config.storageEncryptionKey),
      sessionSecretEphemeral: deps.config.sessionSecretEphemeral,
      registrationEnabled: deps.config.allowRegistration,
      userCount: deps.authStore.getUserCount(),
      activeSessions: deps.authStore.getActiveSessionCount(),
      totalConversations: deps.memoryStore.getConversationCount(),
      totalMessages: deps.memoryStore.getTotalMessageCount(),
      envStatus: deps.config.envStatus,
    });
  });

  router.get('/api/admin/users', ({ req, res }) => {
    const auth = requireAuth(req, deps.authStore);
    requireAdmin(auth.user);
    sendJson(res, 200, { users: deps.authStore.listUsers() });
  });

  router.delete('/api/admin/users/:id', ({ req, res, params }) => {
    const auth = requireAuth(req, deps.authStore);
    requireAdmin(auth.user);
    requireCsrf(req, auth.session);

    const targetId = parseParamId(params.id, validateUserId, 'user ID');
    if (targetId === auth.user.id) {
      throw new ValidationError('Cannot delete your currently signed-in account');
    }

    const deleted = deps.authStore.deleteUser(targetId);
    if (!deleted) {
      throw new NotFoundError('User not found');
    }
    deps.memoryStore.deleteConversationsByOwner(targetId);
    sendJson(res, 200, { success: true });
  });

  router.post('/api/admin/seed', ({ req, res }) => {
    const auth = requireAuth(req, deps.authStore);
    requireAdmin(auth.user);
    requireCsrf(req, auth.session);

    const seeded = seedUserStarterConversations(deps.memoryStore, auth.user.id);
    sendJson(res, 200, { seeded });
  });

  router.post('/api/search', async ({ req, res, clientIp }) => {
    const auth = requireAuth(req, deps.authStore);
    requireAdmin(auth.user);
    requireCsrf(req, auth.session);

    enforceRateLimit(
      res,
      deps.rateLimiter,
      `search:${auth.user.id}:${clientIp}`,
      20,
      60_000,
      'Rate limit exceeded for web search. Please wait a minute.'
    );

    const body = await readSafeJsonBody(req, 16 * 1024);
    const query = sanitizeText(body.query, 300);
    if (!query) {
      throw new ValidationError('Query is required');
    }
    const rawMax =
      typeof body.maxResults === 'number' && Number.isFinite(body.maxResults)
        ? Math.floor(body.maxResults)
        : 5;
    const maxResults = Math.min(10, Math.max(1, rawMax));
    const results = await deps.searchClient.search(query, maxResults);
    sendJson(res, 200, { query, provider: deps.searchClient.name, results });
  });
}

