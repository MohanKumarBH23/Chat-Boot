import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { canonicalizeUrl, deduplicateResults, MockSearchClient } from '../src/search.js';
import { MemoryStore } from '../src/memory.js';
import { SearchAgent } from '../src/agent.js';
import { getBenchmarkSeedData } from '../src/seed.js';
import { createAppServer } from '../src/server.js';

function createTempStore(): { store: MemoryStore; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deltacheck-test-'));
  const file = path.join(dir, 'memory.json');
  const store = new MemoryStore(file);
  return { store, dir };
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

test('deduplicateResults collapses duplicate canonical URLs and populates domain', () => {
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

test('MemoryStore disambiguates multiple conversations on the same calendar date', () => {
  const { store, dir } = createTempStore();
  try {
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

async function invokeHandler(
  handleRequest: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; body: string }> {
  const reqStream = new PassThrough();
  const req = Object.assign(reqStream, { method, url }) as unknown as http.IncomingMessage;
  if (body !== undefined) {
    reqStream.end(JSON.stringify(body));
  } else {
    reqStream.end();
  }

  let status = 200;
  const chunks: Buffer[] = [];
  const resStream = new PassThrough();
  resStream.on('data', (c: Buffer) => chunks.push(c));

  const res = Object.assign(resStream, {
    statusCode: 200,
    writeHead(code: number) {
      status = code;
      this.statusCode = code;
      return this;
    },
    setHeader() {
      return this;
    },
  }) as unknown as http.ServerResponse;

  const done = new Promise<void>((resolve) => resStream.on('finish', resolve));
  await handleRequest(req, res);
  await done;
  return { status, body: Buffer.concat(chunks).toString('utf-8') };
}

test('createAppServer serves static UI and API endpoints cleanly', async () => {
  const { store, dir } = createTempStore();
  const { handleRequest } = createAppServer({
    memoryStore: store,
    searchProvider: 'mock',
    simulatedDate: new Date('2026-11-11T12:00:00.000Z'),
  });

  try {
    const htmlRes = await invokeHandler(handleRequest, 'GET', '/');
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.body, /<title>DeltaCheck<\/title>/);

    const healthRes = await invokeHandler(handleRequest, 'GET', '/api/health');
    assert.equal(healthRes.status, 200);
    const health = JSON.parse(healthRes.body) as {
      status: string;
      currentDateIso: string;
      conversationCount: number;
    };
    assert.equal(health.status, 'ok');
    assert.equal(health.currentDateIso, '2026-11-11');
    assert.equal(health.conversationCount, 2);

    const convsRes = await invokeHandler(handleRequest, 'GET', '/api/conversations');
    assert.equal(convsRes.status, 200);
    const convs = JSON.parse(convsRes.body) as Array<{ id: string }>;
    assert.equal(convs.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
