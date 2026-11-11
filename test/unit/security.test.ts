import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {
  buildRedactedEnvSummary,
  loadAppConfig,
  normalizeSearchProvider,
} from '../../src/config/env.js';
import { ConfigurationError } from '../../src/security/errors.js';
import { RateLimiter } from '../../src/security/httpSecurity.js';
import {
  resolveSafeStoragePath,
  validateConversationId,
  validatePasswordStrength,
  validateUsername,
} from '../../src/security/validation.js';
import { hashPassword, verifyPassword } from '../../src/storage/authStore.js';

test('hashPassword uses salted scrypt and verifyPassword validates in constant time', async () => {
  const pw = 'Spectro-Line#2026';
  const digestA = await hashPassword(pw);
  const digestB = await hashPassword(pw);

  assert.match(digestA, /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.notEqual(digestA, digestB);
  assert.equal(await verifyPassword(pw, digestA), true);
  assert.equal(await verifyPassword('wrong-password-123', digestA), false);
  assert.equal(await verifyPassword(pw, 'corrupt$hash'), false);
});

test('loadAppConfig validates env inputs cleanly and redacts secrets', () => {
  const safePath = path.join(os.tmpdir(), 'deltacheck-config-test.json');
  const cfg = loadAppConfig(
    { storagePath: safePath },
    {
      NODE_ENV: 'test',
      PORT: '4100',
      SEARCH_PROVIDER: 'mock',
      SESSION_SECRET: '0123456789abcdef0123456789abcdef',
      OPENAI_API_KEY: 'sk-redacted-test-value',
    }
  );

  assert.equal(cfg.port, 4100);
  assert.equal(cfg.isProduction, false);
  assert.equal(cfg.searchProvider, 'mock');
  assert.equal(cfg.envStatus.OPENAI_API_KEY, 'SET');
  assert.equal(cfg.envStatus.TAVILY_API_KEY, 'EMPTY');
  assert.equal(JSON.stringify(buildRedactedEnvSummary({ OPENAI_API_KEY: 'secret-123' })).includes('secret-123'), false);

  assert.throws(
    () => loadAppConfig({ storagePath: safePath }, { SESSION_SECRET: 'too-short' }),
    ConfigurationError
  );
  assert.throws(
    () => normalizeSearchProvider('unsupported_engine'),
    ConfigurationError
  );
});

test('validation helpers enforce username, password, ID, and path safety constraints', () => {
  assert.equal(validateUsername('researcher_01'), true);
  assert.equal(validateUsername('ab'), false);
  assert.equal(validateUsername('../admin'), false);

  assert.equal(validatePasswordStrength('StrongPass-2026!'), null);
  assert.ok(validatePasswordStrength('short'));
  assert.ok(validatePasswordStrength('onlylettersonlyletters'));

  assert.equal(validateConversationId('conv-123_abc'), true);
  assert.equal(validateConversationId('../etc/passwd'), false);

  assert.throws(() => resolveSafeStoragePath('./.env'), ConfigurationError);
  assert.throws(() => resolveSafeStoragePath('./package.json'), ConfigurationError);
  assert.throws(() => resolveSafeStoragePath('./.git/hooks/data.json'), ConfigurationError);
});

test('RateLimiter enforces per-key quotas and reports Retry-After windows', () => {
  const limiter = new RateLimiter();
  const first = limiter.check('login:127.0.0.1', 2, 10_000);
  const second = limiter.check('login:127.0.0.1', 2, 10_000);
  const third = limiter.check('login:127.0.0.1', 2, 10_000);

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSec >= 1);
});
