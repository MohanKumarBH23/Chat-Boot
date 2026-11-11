import crypto from 'node:crypto';
import { AppError, NotFoundError, ValidationError } from '../../security/errors.js';
import {
  readSafeJsonBody,
  sanitizeText,
  validateConversationId,
} from '../../security/validation.js';
import {
  ApiDependencies,
  enforceRateLimit,
  parseParamId,
  requireAuth,
  requireCsrf,
  sendJson,
} from '../helpers.js';
import { ApiRouter } from '../router.js';

/**
 * Registers user-isolated conversation CRUD and Server-Sent Events verification routes.
 */
export function registerConversationRoutes(router: ApiRouter, deps: ApiDependencies): void {
  router.get('/api/conversations', ({ req, res }) => {
    const auth = requireAuth(req, deps.authStore);
    sendJson(res, 200, deps.memoryStore.listConversations(auth.user.id));
  });

  router.post('/api/conversations', async ({ req, res }) => {
    const auth = requireAuth(req, deps.authStore);
    requireCsrf(req, auth.session);

    const body = await readSafeJsonBody(req, 8 * 1024);
    const title = sanitizeText(body.title, 120) || 'New thread';
    const id = `conv-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const conv = deps.memoryStore.createConversation(id, title, undefined, undefined, auth.user.id);
    sendJson(res, 201, conv);
  });

  router.get('/api/conversations/:id', ({ req, res, params }) => {
    const auth = requireAuth(req, deps.authStore);
    const convId = parseParamId(params.id, validateConversationId, 'conversation ID');
    const conv = deps.memoryStore.getConversation(convId, auth.user.id);
    if (!conv) {
      throw new NotFoundError('Conversation not found');
    }
    sendJson(res, 200, conv);
  });

  router.delete('/api/conversations/:id', ({ req, res, params }) => {
    const auth = requireAuth(req, deps.authStore);
    requireCsrf(req, auth.session);

    const convId = parseParamId(params.id, validateConversationId, 'conversation ID');
    const deleted = deps.memoryStore.deleteConversation(convId, auth.user.id);
    if (!deleted) {
      throw new NotFoundError('Conversation not found');
    }
    sendJson(res, 200, { success: true });
  });

  router.post('/api/conversations/:id/messages', async ({ req, res, params, clientIp }) => {
    const auth = requireAuth(req, deps.authStore);
    requireCsrf(req, auth.session);

    enforceRateLimit(
      res,
      deps.rateLimiter,
      `msg:${auth.user.id}:${clientIp}`,
      20,
      60_000,
      'Rate limit exceeded for message execution. Please wait a minute.'
    );

    const convId = parseParamId(params.id, validateConversationId, 'conversation ID');
    const existingAny = deps.memoryStore.getConversation(convId);
    const existingOwned = deps.memoryStore.getConversation(convId, auth.user.id);
    if (existingAny && !existingOwned) {
      throw new NotFoundError('Conversation not found');
    }

    const body = await readSafeJsonBody(req, 32 * 1024);
    const content = sanitizeText(body.content, 4000, true);
    if (!content) {
      throw new ValidationError('Message content is required');
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    try {
      await deps.agent.processWithEvents(
        content,
        convId,
        (event) => {
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        },
        auth.user.id
      );
    } catch (err) {
      const msg =
        err instanceof AppError && err.expose
          ? err.message
          : 'Unable to complete verification request';
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });
}

