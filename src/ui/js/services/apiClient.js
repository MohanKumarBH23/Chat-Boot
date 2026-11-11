/**
 * Centralized HTTP and SSE transport client for DeltaCheck `/api/v1` endpoints.
 * Separates network, CSRF header injection, and error parsing from UI components.
 * @module ui/services/apiClient
 */

export class ApiError extends Error {
  /**
   * @param {string} message - Human-readable error message.
   * @param {number} [status=500] - HTTP status code.
   * @param {string} [code='API_ERROR'] - Machine-readable error code.
   */
  constructor(message, status = 500, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const CSRF_EXEMPT_PREFIXES = ['/api/auth/login', '/api/auth/register', '/api/auth/bootstrap', '/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/bootstrap'];

let csrfTokenGetter = () => '';
let unauthorizedHandler = async () => {};

/**
 * Configures session hooks injected by application bootstrap.
 * @param {{ getCsrfToken: () => string, onUnauthorized: () => Promise<void> | void }} handlers
 */
export function configureApiClient(handlers) {
  csrfTokenGetter = handlers.getCsrfToken || (() => '');
  unauthorizedHandler = handlers.onUnauthorized || (async () => {});
}

async function rawFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  const csrfToken = csrfTokenGetter();

  const needsCsrf =
    method !== 'GET' &&
    method !== 'HEAD' &&
    csrfToken &&
    !CSRF_EXEMPT_PREFIXES.some((prefix) => url.startsWith(prefix));

  if (needsCsrf) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  let resp;
  try {
    resp = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('Network error while contacting server.', 0, 'NETWORK_ERROR');
  }

  if (resp.status === 401 && !url.startsWith('/api/auth/') && !url.startsWith('/api/v1/auth/')) {
    await unauthorizedHandler();
  }

  return resp;
}

async function parseErrorResponse(resp) {
  let payload = {};
  try {
    payload = await resp.json();
  } catch {
    payload = {};
  }
  const message =
    typeof payload.error === 'string' && payload.error
      ? payload.error
      : `Request failed (HTTP ${resp.status})`;
  const code = typeof payload.code === 'string' && payload.code ? payload.code : 'HTTP_ERROR';
  return new ApiError(message, resp.status, code);
}

async function requestJson(url, options = {}) {
  const resp = await rawFetch(url, options);
  if (!resp.ok) {
    throw await parseErrorResponse(resp);
  }
  try {
    return await resp.json();
  } catch {
    throw new ApiError('Received malformed JSON from server.', resp.status, 'INVALID_JSON');
  }
}

export const healthApi = {
  getStatus() {
    return requestJson('/api/v1/health');
  },
};

export const authApi = {
  getSession() {
    return requestJson('/api/v1/auth/me');
  },
  bootstrap(username, password) {
    return requestJson('/api/v1/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  },
  register(username, password) {
    return requestJson('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  },
  login(username, password) {
    return requestJson('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  },
  logout() {
    return requestJson('/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  },
};

export const conversationsApi = {
  list() {
    return requestJson('/api/v1/conversations');
  },
  get(id) {
    return requestJson(`/api/v1/conversations/${encodeURIComponent(id)}`);
  },
  create(title) {
    return requestJson('/api/v1/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  },
  remove(id) {
    return requestJson(`/api/v1/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  /**
   * Dispatches a prompt and streams SSE agent progress/completion events.
   * @param {string} id - Conversation ID.
   * @param {string} content - Sanitized user prompt.
   * @param {(event: Record<string, any>) => void} onEvent - Event handler.
   */
  async sendMessageStream(id, content, onEvent) {
    const resp = await rawFetch(`/api/v1/conversations/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!resp.ok) {
      throw await parseErrorResponse(resp);
    }
    if (!resp.body) {
      throw new ApiError('Response stream unavailable.', resp.status, 'STREAM_UNAVAILABLE');
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith('data:')) continue;
        let event;
        try {
          event = JSON.parse(line.slice(5).trim());
        } catch {
          throw new ApiError('Received malformed event stream packet.', 502, 'STREAM_PARSE_ERROR');
        }
        onEvent(event);
      }
    }
  },
};

export const adminApi = {
  getOverview() {
    return requestJson('/api/v1/admin/overview');
  },
  listUsers() {
    return requestJson('/api/v1/admin/users');
  },
  removeUser(userId) {
    return requestJson(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  },
  seedStarterData() {
    return requestJson('/api/v1/admin/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  },
};

