import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AuthStore } from '../../src/storage/authStore.js';
import { MemoryStore } from '../../src/storage/memoryStore.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deltacheck-storage-test-'));
}

test('MemoryStore disambiguates multiple conversations on the same calendar date', () => {
  const dir = createTempDir();
  const file = path.join(dir, 'memory.json');
  try {
    const store = new MemoryStore(file);

    store.createConversation('c-crm', 'CRM shortlist', undefined, {
      createdAt: '2026-11-09T09:00:00.000Z',
      updatedAt: '2026-11-09T09:05:00.000Z',
    });
    store.addMessage(
      'c-crm',
      {
        id: 'u1',
        role: 'user',
        content: 'Shortlist CRM tools for sales',
        timestamp: '2026-11-09T09:00:00.000Z',
      },
      true
    );

    store.createConversation('c-db', 'Postgres hosting notes', undefined, {
      createdAt: '2026-11-09T11:00:00.000Z',
      updatedAt: '2026-11-09T11:05:00.000Z',
    });
    store.addMessage(
      'c-db',
      {
        id: 'u2',
        role: 'user',
        content: 'Compare Neon and Supabase Postgres pricing',
        timestamp: '2026-11-09T11:00:00.000Z',
      },
      true
    );

    const match = store.findTurnByDateOrEntity('Did Neon Postgres pricing change on Monday?', '2026-11-09');
    assert.ok(match);
    assert.equal(match.conversation.id, 'c-db');

    const reloaded = new MemoryStore(store.filePath);
    assert.equal(reloaded.getConversation('c-crm')?.createdAt, '2026-11-09T09:00:00.000Z');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('AES-256-GCM encryption at rest protects persisted MemoryStore and AuthStore files', async () => {
  const dir = createTempDir();
  const memPath = path.join(dir, 'memory.json');
  const authPath = path.join(dir, 'auth.json');
  const key = crypto.randomBytes(32);

  try {
    const auth = new AuthStore(authPath, {
      sessionSecret: 'test-session-secret-0123456789abcdef-minimum-32',
      encryptionKey: key,
    });
    const admin = await auth.bootstrapAdmin('enc_admin', 'Strong-Encrypted-Pass-1!');

    const mem = new MemoryStore(memPath, true, key);
    mem.createConversation('enc-1', 'Super Secret Board Strategy', undefined, undefined, admin.id);

    const rawAuth = fs.readFileSync(authPath, 'utf-8');
    const rawMem = fs.readFileSync(memPath, 'utf-8');
    assert.doesNotMatch(rawAuth, /enc_admin/);
    assert.doesNotMatch(rawMem, /Super Secret Board Strategy/);
    assert.match(rawMem, /"alg":"aes-256-gcm"/);

    // Reloading without key must throw loudly instead of wiping data
    assert.throws(() => new MemoryStore(memPath, true, null));
    assert.throws(
      () => new AuthStore(authPath, { sessionSecret: 'test-session-secret-0123456789abcdef-minimum-32' })
    );

    // Reloading with matching key restores state cleanly
    const memUnlocked = new MemoryStore(memPath, true, key);
    assert.equal(memUnlocked.getConversation('enc-1', admin.id)?.title, 'Super Secret Board Strategy');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

