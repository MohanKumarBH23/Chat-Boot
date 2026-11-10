import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createSearchClient } from './search.js';
import { MemoryStore } from './memory.js';
import { SearchAgent } from './agent.js';
import { getBenchmarkSeedData } from './seed.js';

// ANSI color helpers
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
};

async function runEvaluationBenchmarks(agent: SearchAgent) {
  console.log(`\n${colors.bold}${colors.magenta}=== RUNNING BENCHMARK EVALUATION TEST SUITE ===${colors.reset}\n`);

  const benchmarkQueries = [
    {
      name: 'Benchmark 1: Monday CRM Shortlist Delta',
      query: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
      expectedEntities: ['HubSpot', 'Pipedrive', 'Salesforce'],
    },
    {
      name: 'Benchmark 2: 3 November Question Check',
      query: 'What did I ask you on 3 November? Is your answer still correct today?',
      expectedEntities: ['Supabase', 'Neon', 'Postgres'],
    },
    {
      name: 'Benchmark 3: Last Tuesday Postgres Hosting Pricing',
      query: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
      expectedEntities: ['Supabase', 'Neon', 'Crunchy Bridge', 'AWS RDS'],
    },
  ];

  let passed = 0;

  for (let i = 0; i < benchmarkQueries.length; i++) {
    const item = benchmarkQueries[i];
    console.log(`${colors.bold}${colors.cyan}[${i + 1}/3] ${item.name}${colors.reset}`);
    console.log(`${colors.dim}Query: "${item.query}"${colors.reset}`);

    const res = await agent.process(item.query, `bench-eval-session-${i}`);

    console.log(`${colors.green}↳ Latency: ${res.latencyMs}ms | Queries Dispatched: ${res.queries.length} | Sources Verified: ${res.sources.length}${colors.reset}`);
    console.log(`${colors.dim}Queries: [${res.queries.map((q) => `"${q}"`).join(', ')}]${colors.reset}`);
    console.log(`\n${colors.bold}Agent Verdict:${colors.reset}\n${res.content}\n`);
    console.log(`${colors.dim}------------------------------------------------------------${colors.reset}\n`);

    // Verification asserts
    const hasVerdict = res.content.length > 50;
    const hasSources = res.sources.length > 0;
    const hasFirstSentenceVerdict = !res.content.startsWith('Based on my search') && !res.content.startsWith('I searched');

    if (hasVerdict && hasSources && hasFirstSentenceVerdict) {
      passed++;
    }
  }

  console.log(`${colors.bold}${colors.green}Benchmark Suite Result: ${passed}/3 Passed Successfully!${colors.reset}\n`);
  return passed === 3;
}

async function main() {
  const isTestMode = process.argv.includes('--test') || process.argv.includes('--eval');

  // Initialize Memory Store & Seed
  const memoryStore = new MemoryStore();
  memoryStore.ensureSeeded(getBenchmarkSeedData);

  // Initialize Search Client
  const searchClient = createSearchClient();

  // Anchored System Clock: Tuesday, Nov 10, 2026
  const anchorDate = new Date('2026-11-10T12:00:00Z');

  // Initialize Agent
  const agent = new SearchAgent({
    searchClient,
    memoryStore,
    simulatedDate: anchorDate,
  });

  if (isTestMode) {
    const success = await runEvaluationBenchmarks(agent);
    process.exit(success ? 0 : 1);
  }

  // Interactive CLI REPL
  console.clear();
  console.log(`${colors.bold}${colors.cyan}================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}             ANTIGRAVITY CLI CHAT SEARCH AGENT                  ${colors.reset}`);
  console.log(`${colors.dim}  Temporal Grounding · Parallel Search Dispatch · Differential Synthesis  ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}================================================================${colors.reset}`);
  console.log(`${colors.dim}System Date:      ${colors.reset}${anchorDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}`);
  console.log(`${colors.dim}Search Engine:    ${colors.reset}${colors.green}${searchClient.name.toUpperCase()}${colors.reset}`);
  console.log(`${colors.dim}Storage File:     ${colors.reset}${memoryStore['filePath']}`);
  console.log(`${colors.dim}Benchmark Memory: ${colors.reset}${memoryStore.listConversations().length} pre-seeded reference sessions loaded`);
  console.log(`${colors.dim}Commands:         Type 'exit' to quit, 'eval' to run benchmark suite${colors.reset}`);
  console.log(`${colors.cyan}----------------------------------------------------------------${colors.reset}\n`);

  const rl = readline.createInterface({ input, output });
  const sessionId = `cli-session-${Date.now()}`;

  while (true) {
    try {
      const userPrompt = await rl.question(`${colors.bold}${colors.blue}You ❯ ${colors.reset}`);
      const trimmed = userPrompt.trim();

      if (!trimmed) continue;
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log(`\n${colors.dim}Goodbye!${colors.reset}`);
        rl.close();
        break;
      }

      if (trimmed.toLowerCase() === 'eval' || trimmed.toLowerCase() === 'test') {
        await runEvaluationBenchmarks(agent);
        continue;
      }

      console.log(`\n${colors.dim}⚡ Processing Stage 1 (Route) ➔ Stage 2 (Parallel Search) ➔ Stage 3 (Synthesis)...${colors.reset}`);

      const response = await agent.process(trimmed, sessionId);

      console.log(`\n${colors.bold}${colors.magenta}Antigravity ❯ ${colors.reset}`);
      console.log(response.content);
      console.log(`\n${colors.dim}────────────────────────────────────────────────────────────────${colors.reset}`);
      console.log(
        `${colors.dim}⏱ Latency: ${colors.green}${response.latencyMs}ms${colors.reset} ${colors.dim}| Queries: ${colors.cyan}${response.queries.length}${colors.reset} ${colors.dim}| Sources: ${colors.yellow}${response.sources.length}${colors.reset}`
      );
      if (response.queries.length > 0) {
        console.log(`${colors.dim}Dispatched: ${response.queries.map((q) => `"${q}"`).join(', ')}${colors.reset}`);
      }
      console.log(`${colors.dim}────────────────────────────────────────────────────────────────${colors.reset}\n`);
    } catch (err) {
      console.error(`\n${colors.yellow}Error:${colors.reset}`, (err as Error).message);
    }
  }
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});

