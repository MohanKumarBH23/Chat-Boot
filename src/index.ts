import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createSearchClient } from './search.js';
import { MemoryStore } from './memory.js';
import { SearchAgent } from './agent.js';
import { seedDataset } from './seed.js';

const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  amber: '\x1b[33m',
  red: '\x1b[31m',
};

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(3)}s`;
}

async function runEvaluationDryRun(memoryStore: MemoryStore): Promise<boolean> {
  console.log('\nDeltaCheck evaluation dry-run (simulated clock: 2026-11-11)\n');

  const agent = new SearchAgent({
    searchClient: createSearchClient('mock'),
    memoryStore,
    simulatedDate: new Date('2026-11-11T12:00:00.000Z'),
  });

  const cases = [
    {
      name: 'Monday CRM shortlist delta',
      query:
        'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
      expectedRefDate: '2026-11-09',
      requiredTerms: ['HubSpot', 'Pipedrive', 'Salesforce', 'Freshsales', 'Close'],
    },
    {
      name: '3 November question recall',
      query: 'What did I ask you on 3 November? Is your answer still correct today?',
      expectedRefDate: '2026-11-03',
      requiredTerms: ['Postgres', 'Supabase', 'Neon', 'Crunchy Bridge', 'AWS RDS'],
    },
    {
      name: 'Last Tuesday Postgres pricing',
      query: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
      expectedRefDate: '2026-11-03',
      requiredTerms: ['Supabase', 'Neon', 'Crunchy Bridge', 'AWS RDS'],
    },
  ];

  let passed = 0;

  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    const res = await agent.process(item.query, `eval-dry-run-${i}`);
    const anchor = res.routerDecision.temporalAnchor;
    const refTag = anchor.referenceDateIso
      ? `${anchor.referenceDateIso} (-${anchor.deltaDays}d)`
      : 'none';

    console.log(`[${i + 1}/${cases.length}] ${item.name}`);
    console.log(`${ansi.dim}  ref ${refTag} | ${res.queries.length} queries | ${res.sources.length} sources | ${formatSeconds(res.latencyMs)}${ansi.reset}`);
    console.log(`${res.content}\n`);

    const noFiller =
      !res.content.startsWith('Based on my search') &&
      !res.content.startsWith('I checked') &&
      !res.content.startsWith('Here is what I found');
    const hasLinks = /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(res.content);
    const matchesRefDate = anchor.referenceDateIso === item.expectedRefDate;
    const coversEntities = item.requiredTerms.every((term) =>
      res.content.toLowerCase().includes(term.toLowerCase())
    );

    if (noFiller && hasLinks && matchesRefDate && coversEntities && res.sources.length > 0) {
      passed++;
    } else {
      console.error(
        `${ansi.red}  failed: noFiller=${noFiller}, hasLinks=${hasLinks}, matchesRefDate=${matchesRefDate} (got ${anchor.referenceDateIso}), coversEntities=${coversEntities}${ansi.reset}`
      );
    }
  }

  console.log(`Result: ${passed}/${cases.length} passed`);
  return passed === cases.length;
}

async function main() {
  const isEvalMode = process.argv.includes('--eval') || process.argv.includes('--test');
  const memoryStore = new MemoryStore();
  seedDataset(memoryStore, false);

  if (isEvalMode) {
    const dryRunStore = new MemoryStore('./data/agent_memory.json', false);
    seedDataset(dryRunStore, false);
    const ok = await runEvaluationDryRun(dryRunStore);
    process.exit(ok ? 0 : 1);
  }

  const searchClient = createSearchClient();
  const agent = new SearchAgent({ searchClient, memoryStore });
  const now = new Date();

  console.log(`\n${ansi.bold}DeltaCheck${ansi.reset} ${ansi.dim}(${agent.formatIsoDate(now)} · ${searchClient.name} · ${agent.modelName})${ansi.reset}`);
  console.log(`${ansi.dim}Memory: ${memoryStore.filePath} (${memoryStore.listConversations().length} threads)${ansi.reset}`);
  console.log(`${ansi.dim}Type a question, 'eval' to run fixture checks, or 'exit' to quit.${ansi.reset}\n`);

  const rl = readline.createInterface({ input, output });
  const sessionId = `cli-${Date.now()}`;

  while (true) {
    try {
      const raw = await rl.question(`${ansi.bold}> ${ansi.reset}`);
      const trimmed = raw.trim();
      if (!trimmed) continue;

      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        rl.close();
        break;
      }

      if (trimmed.toLowerCase() === 'eval') {
        await runEvaluationDryRun(memoryStore);
        continue;
      }

      const response = await agent.process(trimmed, sessionId);
      const anchor = response.routerDecision.temporalAnchor;

      console.log(`\n${response.content}`);

      const metaParts = [
        formatSeconds(response.latencyMs),
        `${response.queries.length} ${response.queries.length === 1 ? 'query' : 'queries'}`,
        `${response.sources.length} ${response.sources.length === 1 ? 'source' : 'sources'}`,
      ];
      if (anchor.referenceDateIso) {
        metaParts.push(`${ansi.amber}${anchor.referenceDateIso} (-${anchor.deltaDays}d)${ansi.reset}`);
      }
      console.log(`\n${ansi.dim}${metaParts.join(' · ')}${ansi.reset}`);

      if (response.sources.length > 0) {
        response.sources.forEach((s, idx) => {
          const dateStr = s.publishedDate ? ` · ${s.publishedDate}` : '';
          console.log(`${ansi.dim}  [${idx + 1}] ${s.title} (${s.domain}${dateStr}) ${s.url}${ansi.reset}`);
        });
      }
      console.log('');
    } catch (err) {
      console.error(`${ansi.red}Error:${ansi.reset}`, (err as Error).message);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
