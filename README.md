# DeltaCheck

DeltaCheck is a TypeScript web search and episodic memory chat agent with a web interface and CLI REPL. It resolves explicit and relative dates deterministically against the system clock, recalls matching prior conversation turns from JSON storage, dispatches search queries in parallel, and synthesizes a source-cited answer comparing past baselines against current results.

## Prerequisites

- Node.js 20 or newer (tested on v24.15.0)
- npm 10 or newer

## Setup

```bash
npm install
cp .env.example .env
npm run seed
```

Without API keys configured in `.env`, DeltaCheck runs using the offline `MockSearchClient` (fixture results for the seeded CRM and Postgres topics; empty results for unknown queries) and a deterministic fallback synthesizer. Add `OPENAI_API_KEY` plus `TAVILY_API_KEY` or `BRAVE_API_KEY` in `.env` for live web search and LLM synthesis.

## Usage

Start the web interface (default `http://localhost:3000`):

```bash
npm run dev
```

Start the CLI REPL:

```bash
npm run cli
```

Run the CLI evaluation fixture dry-run:

```bash
npm run cli -- --eval
```

Run tests and typechecking:

```bash
npx tsc --noEmit
npm test
```

Build compiled JavaScript to `dist/`:

```bash
npm run build
```

## Architecture

Each user prompt runs through a three-stage pipeline in `src/agent.ts`:

1. **Stage 1 — Temporal Grounding & Routing (`stage1Route`)**: Resolves explicit dates (`3 November`), `N days ago`, `yesterday`, and weekday references (`Monday`, `last Tuesday`) in TypeScript, queries `MemoryStore` for matching prior turns by date and token overlap, and emits 1–3 search queries.
2. **Stage 2 — Parallel Search (`stage2Search`)**: Runs queries concurrently with `Promise.all` through `ISearchClient` (`TavilySearchClient`, `BraveSearchClient`, or `MockSearchClient`) and deduplicates results by canonical URL.
3. **Stage 3 — Synthesis (`stage3Synthesize`)**: Contrasts recalled baseline turns against retrieved search snippets and returns an answer with markdown citations.

## Configuration

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port for the web server (`src/server.ts`) | `3000` |
| `OPENAI_API_KEY` | OpenAI API key for routing and synthesis | None (heuristic fallback) |
| `OPENAI_MODEL` | OpenAI chat completion model | `gpt-4o` |
| `SEARCH_PROVIDER` | Search backend (`tavily`, `brave`, `mock`) | `tavily` |
| `TAVILY_API_KEY` | Tavily API key | None (mock fallback) |
| `BRAVE_API_KEY` | Brave Search API key | None |
| `STORAGE_PATH` | Path to JSON conversation history | `./data/agent_memory.json` |

## Repository Layout

```text
src/
  types.ts      Core TypeScript interfaces
  search.ts     Tavily, Brave, and Mock search clients + URL canonicalization
  memory.ts     JSON-backed MemoryStore with date/entity turn retrieval
  seed.ts       Seeds sample CRM and Postgres baseline conversations
  agent.ts      Three-stage pipeline (route, parallel search, synthesize)
  index.ts      CLI REPL and --eval runner
  server.ts     Node HTTP + SSE server for the web UI
  ui/           Frontend HTML, CSS, and client JS
test/
  agent.test.ts Unit and pipeline tests using node:test
```

## License

MIT — see [LICENSE](LICENSE).
