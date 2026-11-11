# DeltaCheck Design Notes

## Problem

Conversational search tools struggle on follow-up questions that anchor to past interactions by date (for example, "What changed since Monday?" or "What did I ask on 3 November?"). Three issues appear regularly:

1. **Serial ReAct latency**: Alternating LLM calls and single search queries scales wall-clock time linearly with query count.
2. **Weak temporal matching in vector search**: Embedding similarity groups topics well but handles relative calendar phrases poorly.
3. **Fabricating changes when nothing changed**: When live search shows no price increase or announcement, unconstrained synthesis often invents changes rather than confirming stability.

## Design Choices

### Three-Stage Pipeline (`src/agent.ts`)

Instead of an unbounded tool-calling loop, each turn executes at most two LLM calls (routing and synthesis) with one concurrent search fan-out between them:

- **Stage 1 (`stage1Route`)**: Computes the current date and resolves relative phrases (`Monday`, `last Tuesday`, `3 November`, `2 days ago`) in deterministic TypeScript before any LLM call. Queries `MemoryStore` for matching prior turns and generates 1–3 targeted queries. Greetings skip Stage 2.
- **Stage 2 (`stage2Search`)**: Dispatches queries concurrently via `Promise.all` and deduplicates results by canonical URL (`utm_*`, `ref`, `source`, `fbclid`, fragment, and trailing slash stripped).
- **Stage 3 (`stage3Synthesize`)**: Receives the recalled prior exchange alongside deduplicated search results and contrasts baseline facts against retrieved snippets. When running offline without an API key, `MockSearchClient` returns empty results for unknown topics rather than synthetic placeholder URLs.

**Trade-off**: Planning queries upfront avoids serial hops and keeps latency predictable, at the cost of not issuing follow-up searches mid-turn if initial results point to an unexpected entity.

### Calendar Arithmetic Outside the LLM

Date resolution in `SearchAgent.getTemporalAnchor` runs in code using word-boundary regexes and `Date` arithmetic. When multiple weekdays appear in one sentence, explicit `last <weekday>` expressions take priority over bare weekday names so phrases like "Last Tuesday I compared Monday's rates" resolve cleanly.

### JSON Episodic Memory (`src/memory.ts`)

Conversations are stored as paired user/assistant turns in `./data/agent_memory.json` with extracted entity metadata:

- When a reference date (`YYYY-MM-DD`) is resolved, `findTurnByDateOrEntity` collects all turns matching that date and ranks them by token overlap with the prompt, breaking ties by most recent timestamp.
- Writes go through a temporary file (`agent_memory.json.tmp`) followed by `fs.renameSync` to avoid corrupting the store on interrupted writes.

**Trade-off**: Loading the conversation map into memory keeps lookups fast for personal history sizes (hundreds to a few thousand turns). Scaling to multi-user or large archives would require SQLite or a dedicated database.

### Web Server & UI (`src/server.ts`, `src/ui/`)

The web server uses Node's built-in `node:http` module to serve static frontend assets and stream Stage 1 / Stage 2 progress over Server-Sent Events (`POST /api/conversations/:id/messages`), keeping runtime dependencies limited to `dotenv` and `openai`.
