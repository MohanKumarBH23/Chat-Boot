import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { createAppServer } from '../../src/api/server.js';
import { AppConfig, loadAppConfig } from '../../src/config/env.js';
import { RateLimiter } from '../../src/security/httpSecurity.js';
import { MemoryStore } from '../../src/storage/memoryStore.js';

function createTempStore(): { store: MemoryStore; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deltacheck-api-test-'));
  const file = path.join(dir, 'memory.json');
  return { store: new MemoryStore(file), dir };
}

function makeTestAppConfig(storagePath: string): AppConfig {
  return loadAppConfig(
    {
      storagePath,
      isProduction: false,
      allowRegistration: true,
      searchProvider: 'mock',
      sessionSecret: 'test-session-secret-0123456789abcdef-minimum-32',
      openaiApiKey: '',
      tavilyApiKey: '',
      braveApiKey: '',
    },
    {}
  );
}

interface MockHttpResult {
  status: number;
  body: string;
  headers: Record<string, string | string[]>;
}

async function invokeHandler(
  handleRequest: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
  method: string,
  url: string,
  body?: unknown,
  reqHeaders?: Record<string, string>
): Promise<MockHttpResult> {
  const reqStream = new PassThrough();
  const normalizedReqHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(reqHeaders || {})) {
    normalizedReqHeaders[k.toLowerCase()] = v;
  }
  if (body !== undefined && !normalizedReqHeaders['content-type']) {
    normalizedReqHeaders['content-type'] = 'application/json';
  }

  const req = Object.assign(reqStream, {
    method,
    url,
    headers: normalizedReqHeaders,
    socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as http.IncomingMessage;

  if (body !== undefined) {
    reqStream.end(typeof body === 'string' ? body : JSON.stringify(body));
  } else {
    reqStream.end();
  }

  let status = 200;
  const resHeaders: Record<string, string | string[]> = {};
  const chunks: Buffer[] = [];
  const resStream = new PassThrough();
  resStream.on('data', (c: Buffer) => chunks.push(c));

  const setHeader = (name: string, val: string | number | readonly string[]) => {
    const lower = name.toLowerCase();
    resHeaders[lower] = Array.isArray(val) ? [...val] : String(val);
  };

  const res = Object.assign(resStream, {
    statusCode: 200,
    writeHead(code: number, headersObj?: Record<string, string | number | readonly string[]>) {
      status = code;
      this.statusCode = code;
      if (headersObj) {
        for (const [k, v] of Object.entries(headersObj)) {
          setHeader(k, v);
        }
      }
      return this;
    },
    setHeader(name: string, val: string | number | readonly string[]) {
      setHeader(name, val);
      return this;
    },
  }) as unknown as http.ServerResponse;

  const done = new Promise<void>((resolve) => resStream.on('finish', resolve));
  await handleRequest(req, res);
  await done;
  return { status, body: Buffer.concat(chunks).toString('utf-8'), headers: resHeaders };
}

function extractSessionCookieHeader(headers: Record<string, string | string[]>): string {
  const raw = headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  assert.ok(first, 'Expected Set-Cookie header');
  assert.match(first, /HttpOnly/i);
  assert.match(first, /SameSite=Strict/i);
  return first.split(';')[0];
}

test('createAppServer serves modular UI assets, versions /api/v1, and enforces auth & RBAC', async () => {
  const { store, dir } = createTempStore();
  const { handleRequest } = createAppServer({
    memoryStore: store,
    config: makeTestAppConfig(store.filePath),
    simulatedDate: new Date('2026-11-11T12:00:00.000Z'),
  });

  try {
    // Static UI + nested ESM/CSS assets + security headers
    const htmlRes = await invokeHandler(handleRequest, 'GET', '/');
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.body, /<title>DeltaCheck<\/title>/);
    assert.match(htmlRes.body, /src="\/js\/main\.js"/);
    assert.equal(htmlRes.headers['x-content-type-options'], 'nosniff');
    assert.equal(htmlRes.headers['x-frame-options'], 'DENY');
    assert.match(String(htmlRes.headers['content-security-policy']), /script-src 'self'/);
    assert.match(String(htmlRes.headers['content-security-policy']), /frame-ancestors 'none'/);

    const jsRes = await invokeHandler(handleRequest, 'GET', '/js/main.js');
    assert.equal(jsRes.status, 200);
    assert.match(String(jsRes.headers['content-type']), /javascript/);

    const storeRes = await invokeHandler(handleRequest, 'GET', '/js/state/store.js');
    assert.equal(storeRes.status, 200);

    const cssTokenRes = await invokeHandler(handleRequest, 'GET', '/styles/tokens.css');
    assert.equal(cssTokenRes.status, 200);
    assert.match(String(cssTokenRes.headers['content-type']), /text\/css/);

    // Health omits sensitive config & works identically via /api/v1/health alias
    const healthRes = await invokeHandler(handleRequest, 'GET', '/api/health');
    const healthV1Res = await invokeHandler(handleRequest, 'GET', '/api/v1/health');
    assert.equal(healthRes.status, 200);
    assert.equal(healthV1Res.status, 200);
    const health = JSON.parse(healthV1Res.body) as Record<string, unknown>;
    assert.equal(health.status, 'ok');
    assert.equal(health.currentDateIso, '2026-11-11');
    assert.equal(health.conversationCount, undefined);
    assert.equal(health.searchProvider, undefined);

    // 405 Method Not Allowed with Allow header + typed error code
    const methodNotAllowed = await invokeHandler(handleRequest, 'DELETE', '/api/v1/health');
    assert.equal(methodNotAllowed.status, 405);
    assert.match(String(methodNotAllowed.headers['allow']), /GET/);
    assert.equal((JSON.parse(methodNotAllowed.body) as { code: string }).code, 'METHOD_NOT_ALLOWED');

    // Unauthenticated API access denied
    assert.equal((await invokeHandler(handleRequest, 'GET', '/api/conversations')).status, 401);
    assert.equal((await invokeHandler(handleRequest, 'GET', '/api/v1/conversations')).status, 401);
    assert.equal((await invokeHandler(handleRequest, 'GET', '/api/admin/overview')).status, 401);
    assert.equal((await invokeHandler(handleRequest, 'POST', '/api/search', { query: 'test' })).status, 401);

    // Standard signup cannot preempt initial admin setup
    const preReg = await invokeHandler(handleRequest, 'POST', '/api/v1/auth/register', {
      username: 'attacker',
      password: 'Valid-Password-123',
    });
    assert.equal(preReg.status, 403);

    // Weak password rejected on bootstrap with typed error code
    const weakBoot = await invokeHandler(handleRequest, 'POST', '/api/v1/auth/bootstrap', {
      username: 'rootadmin',
      password: 'short',
    });
    assert.equal(weakBoot.status, 400);
    assert.equal((JSON.parse(weakBoot.body) as { code: string }).code, 'VALIDATION_ERROR');

    // First-run bootstrap creates admin cleanly
    const bootRes = await invokeHandler(handleRequest, 'POST', '/api/v1/auth/bootstrap', {
      username: 'rootadmin',
      password: 'Admin-Password-2026!',
    });
    assert.equal(bootRes.status, 201);
    const bootData = JSON.parse(bootRes.body) as { user: { role: string }; csrfToken: string };
    assert.equal(bootData.user.role, 'admin');
    const adminCookie = extractSessionCookieHeader(bootRes.headers);

    // Bootstrap cannot run twice
    const secondBoot = await invokeHandler(handleRequest, 'POST', '/api/auth/bootstrap', {
      username: 'secondadmin',
      password: 'Admin-Password-2026!',
    });
    assert.equal(secondBoot.status, 403);

    // Register user attempting role escalation -> forced to 'user'
    const regRes = await invokeHandler(handleRequest, 'POST', '/api/v1/auth/register', {
      username: 'researcher_a',
      password: 'User-Password-2026!',
      role: 'admin',
    });
    assert.equal(regRes.status, 201);
    const regData = JSON.parse(regRes.body) as { user: { role: string }; csrfToken: string };
    assert.equal(regData.user.role, 'user');
    const userCookie = extractSessionCookieHeader(regRes.headers);

    // Non-admin blocked from admin endpoints (GET & POST)
    assert.equal(
      (await invokeHandler(handleRequest, 'GET', '/api/v1/admin/overview', undefined, { cookie: userCookie })).status,
      403
    );
    assert.equal(
      (
        await invokeHandler(
          handleRequest,
          'POST',
          '/api/v1/search',
          { query: 'crm pricing' },
          { cookie: userCookie, 'x-csrf-token': regData.csrfToken }
        )
      ).status,
      403
    );

    // Admin allowed on admin overview & env keys are strictly redacted
    const adminOverview = await invokeHandler(handleRequest, 'GET', '/api/v1/admin/overview', undefined, {
      cookie: adminCookie,
    });
    assert.equal(adminOverview.status, 200);
    const overview = JSON.parse(adminOverview.body) as { userCount: number; envStatus: Record<string, string> };
    assert.equal(overview.userCount, 2);
    for (const v of Object.values(overview.envStatus)) {
      assert.ok(v === 'SET' || v === 'EMPTY');
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('User isolation blocks IDOR access and prevents cross-user RAG baseline leakage', async () => {
  const { store, dir } = createTempStore();
  const { handleRequest } = createAppServer({
    memoryStore: store,
    config: makeTestAppConfig(store.filePath),
    simulatedDate: new Date('2026-11-11T12:00:00.000Z'),
  });

  try {
    await invokeHandler(handleRequest, 'POST', '/api/auth/bootstrap', {
      username: 'owner_admin',
      password: 'Admin-Password-2026!',
    });

    const userARes = await invokeHandler(handleRequest, 'POST', '/api/auth/register', {
      username: 'alice_user',
      password: 'Alice-Password-2026!',
    });
    const aliceData = JSON.parse(userARes.body) as { user: { id: string }; csrfToken: string };

    const userBRes = await invokeHandler(handleRequest, 'POST', '/api/auth/register', {
      username: 'bob_user',
      password: 'Bob-Password-2026!!',
    });
    const bobData = JSON.parse(userBRes.body) as { user: { id: string }; csrfToken: string };
    const bobCookie = extractSessionCookieHeader(userBRes.headers);

    const secretConv = store.createConversation(
      'conv-alice-secret',
      'Confidential M&A Target AcmeCloud',
      undefined,
      { createdAt: '2026-11-05T10:00:00.000Z', updatedAt: '2026-11-05T10:05:00.000Z' },
      aliceData.user.id
    );
    store.addMessage(
      secretConv.id,
      {
        id: 'm-alice-1',
        role: 'user',
        content: 'Confidential M&A target AcmeCloud acquisition budget is $40M.',
        timestamp: '2026-11-05T10:00:00.000Z',
        metadata: { entities: ['AcmeCloud'] },
      },
      true,
      aliceData.user.id
    );

    const bobConvRes = await invokeHandler(
      handleRequest,
      'POST',
      '/api/v1/conversations',
      { title: 'Bob own research' },
      { cookie: bobCookie, 'x-csrf-token': bobData.csrfToken }
    );
    assert.equal(bobConvRes.status, 201);
    const bobConv = JSON.parse(bobConvRes.body) as { id: string };

    assert.equal(
      (await invokeHandler(handleRequest, 'GET', `/api/v1/conversations/${secretConv.id}`, undefined, { cookie: bobCookie })).status,
      404
    );
    assert.equal(
      (
        await invokeHandler(
          handleRequest,
          'DELETE',
          `/api/v1/conversations/${secretConv.id}`,
          undefined,
          { cookie: bobCookie, 'x-csrf-token': bobData.csrfToken }
        )
      ).status,
      404
    );
    assert.equal(
      (
        await invokeHandler(
          handleRequest,
          'POST',
          `/api/v1/conversations/${secretConv.id}/messages`,
          { content: 'leak' },
          { cookie: bobCookie, 'x-csrf-token': bobData.csrfToken }
        )
      ).status,
      404
    );

    const bobMsgRes = await invokeHandler(
      handleRequest,
      'POST',
      `/api/v1/conversations/${bobConv.id}/messages`,
      { content: 'What did we say on 5 November about AcmeCloud?' },
      { cookie: bobCookie, 'x-csrf-token': bobData.csrfToken }
    );
    assert.equal(bobMsgRes.status, 200);
    assert.doesNotMatch(bobMsgRes.body, /40M/i);
    assert.doesNotMatch(bobMsgRes.body, /Confidential M&A/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CSRF, CORS, path traversal blocking, JSON safety, and rate limiting enforce boundaries', async () => {
  const { store, dir } = createTempStore();
  const { handleRequest } = createAppServer({
    memoryStore: store,
    config: makeTestAppConfig(store.filePath),
    simulatedDate: new Date('2026-11-11T12:00:00.000Z'),
    rateLimiter: new RateLimiter(),
  });

  try {
    const bootRes = await invokeHandler(handleRequest, 'POST', '/api/auth/bootstrap', {
      username: 'csrf_admin',
      password: 'Admin-Password-2026!',
    });
    const bootData = JSON.parse(bootRes.body) as { csrfToken: string };
    const cookie = extractSessionCookieHeader(bootRes.headers);

    assert.equal(
      (await invokeHandler(handleRequest, 'POST', '/api/conversations', { title: 'Test' }, { cookie })).status,
      403
    );
    assert.equal(
      (
        await invokeHandler(
          handleRequest,
          'POST',
          '/api/conversations',
          { title: 'Test' },
          { cookie, 'x-csrf-token': 'wrong-csrf-token' }
        )
      ).status,
      403
    );
    assert.equal(
      (
        await invokeHandler(
          handleRequest,
          'POST',
          '/api/conversations',
          { title: 'Test' },
          { cookie, 'x-csrf-token': bootData.csrfToken }
        )
      ).status,
      201
    );

    const badCors = await invokeHandler(handleRequest, 'GET', '/api/health', undefined, {
      host: 'localhost:3000',
      origin: 'https://evil.example',
    });
    assert.equal(badCors.status, 403);

    const sameOrigin = await invokeHandler(handleRequest, 'GET', '/api/health', undefined, {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
    });
    assert.equal(sameOrigin.status, 200);
    assert.equal(sameOrigin.headers['access-control-allow-origin'], 'http://localhost:3000');

    for (const badPath of ['/.env', '/%2e%2e/.env', '/../package.json', '/.git/config', '/does-not-exist.js']) {
      const res = await invokeHandler(handleRequest, 'GET', badPath);
      assert.equal(res.status, 404, `Expected 404 for ${badPath}`);
    }

    const hugeRes = await invokeHandler(
      handleRequest,
      'POST',
      '/api/conversations',
      '{"title":"' + 'a'.repeat(40000) + '"}',
      { cookie, 'x-csrf-token': bootData.csrfToken, 'content-type': 'application/json' }
    );
    assert.equal(hugeRes.status, 413);

    const badJsonRes = await invokeHandler(
      handleRequest,
      'POST',
      '/api/conversations',
      '{not-json',
      { cookie, 'x-csrf-token': bootData.csrfToken, 'content-type': 'application/json' }
    );
    assert.equal(badJsonRes.status, 400);

    const protoRes = await invokeHandler(
      handleRequest,
      'POST',
      '/api/conversations',
      '{"__proto__":{"polluted":true},"title":"Safe"}',
      { cookie, 'x-csrf-token': bootData.csrfToken, 'content-type': 'application/json' }
    );
    assert.equal(protoRes.status, 201);
    assert.equal(({} as { polluted?: unknown }).polluted, undefined);

    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const loginAttempt = await invokeHandler(handleRequest, 'POST', '/api/auth/login', {
        username: 'csrf_admin',
        password: 'wrong-password-123',
      });
      if (loginAttempt.status === 429) {
        got429 = true;
        assert.ok(loginAttempt.headers['retry-after']);
        break;
      }
    }
    assert.equal(got429, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

