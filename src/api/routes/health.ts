import { ApiDependencies, sendJson } from '../helpers.js';
import { ApiRouter } from '../router.js';

/**
 * Registers public liveness endpoints with zero internal config/secret disclosure.
 */
export function registerHealthRoutes(router: ApiRouter, deps: ApiDependencies): void {
  router.get('/api/health', ({ res }) => {
    const anchor = deps.agent.getTemporalAnchor('');
    sendJson(res, 200, {
      status: 'ok',
      currentDateIso: anchor.currentDateIso,
      currentFormatted: anchor.currentFormatted,
    });
  });
}

