import assert from 'assert';
import { TemporalReasoner } from '../src/agent/temporal.js';
import { ConversationStore } from '../src/memory/store.js';
import { WebSearchTool } from '../src/tools/search/index.js';
import { SearchAgent } from '../src/agent/index.js';
import { AgentStreamEvent } from '../src/types/index.js';

console.log('🧪 Running Antigravity Search Agent Test Suite...\n');

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // --- 1. Temporal Reasoner Tests ---
  console.log('1. Temporal Reasoner & Date Anchor Tests:');
  const anchorDate = new Date('2026-11-10T12:00:00Z'); // Tuesday Nov 10, 2026
  const temporal = new TemporalReasoner(anchorDate);

  await test('Resolves "today" to current anchor date', () => {
    const ctx = temporal.buildTemporalContext('Is this still valid today?');
    assert.strictEqual(ctx.currentDateIso, '2026-11-10');
  });

  await test('Resolves "Monday" to previous day (Nov 9, 2026)', () => {
    const ctx = temporal.buildTemporalContext('On Monday we shortlisted 5 CRM tools.');
    assert(ctx.referenceDateIso, 'Reference date must be defined');
    assert.strictEqual(ctx.referenceDateIso, '2026-11-09');
    assert.strictEqual(ctx.deltaDays, 1);
  });

  await test('Resolves "3 November" to 2026-11-03', () => {
    const ctx = temporal.buildTemporalContext('What did I ask you on 3 November?');
    assert(ctx.referenceDateIso, 'Reference date must be defined');
    assert.strictEqual(ctx.referenceDateIso, '2026-11-03');
    assert.strictEqual(ctx.deltaDays, 7);
  });

  await test('Resolves "last Tuesday" to 7 days prior (2026-11-03)', () => {
    const ctx = temporal.buildTemporalContext('Last Tuesday I asked you about Postgres hosting.');
    assert(ctx.referenceDateIso, 'Reference date must be defined');
    assert.strictEqual(ctx.referenceDateIso, '2026-11-03');
  });

  // --- 2. Memory Store & Benchmark Seeding Tests ---
  console.log('\n2. Episodic Memory Store & Benchmark Datasets Tests:');
  const store = new ConversationStore('./test-data');

  await test('Pre-seeds evaluation benchmark conversations', () => {
    const convs = store.listConversations();
    assert(convs.length >= 3, `Expected at least 3 conversations, found ${convs.length}`);
    const crmConv = convs.find((c) => c.benchmarkScenario === 'crm-shortlist');
    const nov3Conv = convs.find((c) => c.benchmarkScenario === 'nov-3-answer');
    const pgConv = convs.find((c) => c.benchmarkScenario === 'postgres-hosting');

    assert(crmConv, 'Monday CRM shortlist scenario must exist');
    assert(nov3Conv, '3 November query scenario must exist');
    assert(pgConv, 'Last Tuesday Postgres scenario must exist');
  });

  await test('Finds relevant past turn for "3 November" query', () => {
    const found = store.findRelevantTurn('fresh-conv', 'What did I ask you on 3 November?', '2026-11-03');
    assert(found, 'Should find turn from 3 November');
    assert(found.message.content.includes('vector'), 'Should match vector db response');
  });

  await test('Finds relevant past turn for "CRM tools" keyword', () => {
    const found = store.findRelevantTurn('fresh-conv', 'Has any CRM tool changed pricing?');
    assert(found, 'Should find CRM conversation turn');
    assert(found.message.content.includes('HubSpot'), 'Should contain HubSpot in content');
  });

  // --- 3. Web Search Tool & Parallel Deduplication Tests ---
  console.log('\n3. Web Search Tool & Parallel Deduplication Tests:');
  const searchTool = new WebSearchTool('mock');

  await test('Executes single query search using mock provider', async () => {
    const results = await searchTool.search('CRM tools pricing 2026');
    assert(results.length > 0, 'Must return results');
    assert(results[0].title.length > 0, 'Result must have title');
    assert(results[0].url.startsWith('http'), 'Result must have URL');
  });

  await test('Executes parallel queries with URL deduplication', async () => {
    const queries = [
      'HubSpot CRM pricing changes 2026',
      'Salesforce Sales Cloud release notes 2026',
      'HubSpot CRM pricing changes 2026', // duplicate query to test dedup
    ];
    const { results, metrics } = await searchTool.searchParallel(queries);
    assert(results.length > 0, 'Must return deduplicated results');
    assert(metrics.length === 2, 'Metrics must record 2 unique queries');
  });

  // --- 4. End-to-End Search Agent Stream Test ---
  console.log('\n4. End-to-End Search Agent Orchestration Test:');
  const agent = new SearchAgent({
    conversationStore: store,
    webSearchTool: searchTool,
    temporalReasoner: temporal,
  });

  await test('Streams complete response for Monday CRM shortlist evaluation prompt', async () => {
    const conv = store.createConversation('Evaluation Test Chat');
    const prompt = 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?';

    const events: AgentStreamEvent[] = [];
    for await (const event of agent.chatStream(conv.id, prompt)) {
      events.push(event);
    }

    // Verify key phases occurred
    const planEvent = events.find((e) => e.type === 'plan');
    const sourcesEvent = events.find((e) => e.type === 'sources_ready');
    const completeEvent = events.find((e) => e.type === 'complete');

    assert(planEvent, 'Must emit plan event');
    assert(sourcesEvent, 'Must emit sources_ready event');
    assert(completeEvent, 'Must emit complete event');

    if (completeEvent && completeEvent.type === 'complete') {
      const msg = completeEvent.message;
      assert(msg.sources && msg.sources.length > 0, 'Assistant message must have grounding sources');
      assert(msg.metrics && msg.metrics.totalDurationMs > 0, 'Assistant message must contain performance metrics');
      assert(msg.content.includes('[1]'), 'Assistant response must contain inline citations [1]');
    }
  });

  await test('Streams complete response for 3 November evaluation prompt', async () => {
    const conv = store.createConversation('Nov 3 Check Chat');
    const prompt = 'What did I ask you on 3 November? Is your answer still correct today?';

    const events: AgentStreamEvent[] = [];
    for await (const event of agent.chatStream(conv.id, prompt)) {
      events.push(event);
    }

    const planEvent = events.find((e) => e.type === 'plan');
    const completeEvent = events.find((e) => e.type === 'complete');

    assert(planEvent, 'Must emit plan event');
    assert(completeEvent, 'Must emit complete event');

    if (completeEvent && completeEvent.type === 'complete') {
      const msg = completeEvent.message;
      assert(msg.content.length > 0, 'Must produce response');
      assert(msg.sources && msg.sources.length > 0, 'Must have grounding sources');
    }
  });

  await test('Streams complete response for Last Tuesday Postgres evaluation prompt', async () => {
    const conv = store.createConversation('Postgres Check Chat');
    const prompt = 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?';

    const events: AgentStreamEvent[] = [];
    for await (const event of agent.chatStream(conv.id, prompt)) {
      events.push(event);
    }

    const planEvent = events.find((e) => e.type === 'plan');
    const completeEvent = events.find((e) => e.type === 'complete');

    assert(planEvent, 'Must emit plan event');
    assert(completeEvent, 'Must emit complete event');

    if (completeEvent && completeEvent.type === 'complete') {
      const msg = completeEvent.message;
      assert(msg.content.length > 0, 'Must produce response');
      assert(msg.sources && msg.sources.length > 0, 'Must have grounding sources');
    }
  });

  console.log(`\n========================================`);
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
