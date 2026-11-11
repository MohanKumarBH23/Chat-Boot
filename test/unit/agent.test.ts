import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UpstreamServiceError } from '../../src/security/errors.js';
import { SearchAgent } from '../../src/services/agent/searchAgent.js';
import {
  BraveSearchClient,
  MockSearchClient,
  canonicalizeUrl,
  deduplicateResults,
} from '../../src/services/search/index.js';
import { MemoryStore } from '../../src/storage/memoryStore.js';
import { getBenchmarkSeedData } from '../../src/storage/seed.js';

function createTempStore(): { store: MemoryStore; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deltacheck-unit-agent-'));
  const file = path.join(dir, 'memory.json');
  return { store: new MemoryStore(file), dir };
}

test('canonicalizeUrl strips tracking query params, hashes, and trailing slashes', () => {
  assert.equal(
    canonicalizeUrl('https://www.hubspot.com/pricing/sales-hub/?utm_source=x&ref=abc#plans'),
    'https://www.hubspot.com/pricing/sales-hub'
  );
  assert.equal(
    canonicalizeUrl('https://neon.tech/pricing?plan=scale&fbclid=123'),
    'https://neon.tech/pricing?plan=scale'
  );
});

test('deduplicateResults collapses duplicate canonical URLs and filters unsafe schemes', () => {
  const results = deduplicateResults([
    {
      title: 'Neon A',
      url: 'https://neon.tech/pricing/?utm_medium=cpc',
      snippet: 'First',
      canonicalUrl: '',
      domain: '',
    },
    {
      title: 'Neon B',
      url: 'https://neon.tech/pricing',
      snippet: 'Duplicate',
      canonicalUrl: '',
      domain: '',
    },
    {
      title: 'XSS Link',
      url: 'javascript:alert(1)',
      snippet: 'Bad scheme',
      canonicalUrl: '',
      domain: '',
    },
  ]);

  assert.equal(results.length, 1);
  assert.equal(results[0].domain, 'neon.tech');
  assert.equal(results[0].canonicalUrl, 'https://neon.tech/pricing');
});

test('getTemporalAnchor resolves explicit dates, ago offsets, and prefers last weekday', () => {
  const { store, dir } = createTempStore();
  try {
    const agent = new SearchAgent({
      searchClient: new MockSearchClient(),
      memoryStore: store,
      simulatedDate: new Date('2026-11-11T12:00:00.000Z'),
      openaiApiKey: '',
    });

    const monday = agent.getTemporalAnchor('On Monday we shortlisted 5 CRM tools');
    assert.equal(monday.referenceDateIso, '2026-11-09');
    assert.equal(monday.deltaDays, 2);

    const nov3 = agent.getTemporalAnchor('What did I ask you on 3 November?');
    assert.equal(nov3.referenceDateIso, '2026-11-03');
    assert.equal(nov3.deltaDays, 8);

    const lastTuesday = agent.getTemporalAnchor('Last Tuesday I compared Monday pricing');
    assert.equal(lastTuesday.referenceDateIso, '2026-11-03');
    assert.equal(lastTuesday.deltaDays, 8);

    const twoDaysAgo = agent.getTemporalAnchor('Any update from 2 days ago?');
    assert.equal(twoDaysAgo.referenceDateIso, '2026-11-09');
    assert.equal(twoDaysAgo.deltaDays, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SearchAgent offline pipeline recalls seeded baselines and avoids fabricated citations', async () => {
  const { store, dir } = createTempStore();
  try {
    store.ensureSeeded(getBenchmarkSeedData);
    const agent = new SearchAgent({
      searchClient: new MockSearchClient(),
      memoryStore: store,
      simulatedDate: new Date('2026-11-11T12:00:00.000Z'),
      openaiApiKey: '',
    });

    const crmRes = await agent.process(
      'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
      'test-crm'
    );
    assert.equal(crmRes.routerDecision.temporalAnchor.referenceDateIso, '2026-11-09');
    assert.equal(crmRes.sources.length, 5);
    assert.match(crmRes.content, /HubSpot/i);
    assert.match(crmRes.content, /Pipedrive/i);

    const nov3Res = await agent.process(
      'What did I ask you on 3 November? Is your answer still correct today?',
      'test-nov3'
    );
    assert.equal(nov3Res.routerDecision.temporalAnchor.referenceDateIso, '2026-11-03');
    assert.match(nov3Res.content, /Can you compare managed Postgres hosting providers/i);
    assert.equal(nov3Res.sources.length, 4);

    const unknownRes = await agent.process('What is the latest release of Zig?', 'test-unknown');
    assert.equal(unknownRes.sources.length, 0);
    assert.doesNotMatch(unknownRes.content, /example\.com/);
    assert.match(unknownRes.content, /No search results were returned/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('HTTP search client maps upstream errors into UpstreamServiceError without leaking internals', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('upstream gateway failure', { status: 502, statusText: 'Bad Gateway' });

  try {
    const client = new BraveSearchClient('fake-brave-key');
    await assert.rejects(() => client.search('neon pricing'), UpstreamServiceError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

