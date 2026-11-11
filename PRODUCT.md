# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Developers inspecting a temporal-memory RAG agent**: Running DeltaCheck locally (mock or live API mode) to inspect date resolution, recalled baseline matching, search query fan-out, and synthesis grounding.
- **Personal researchers revisiting past notes**: Following up on earlier web queries over days or weeks (e.g., "On Monday...", "3 November", "last Tuesday") to verify what changed and inspect primary sources.

## Product Purpose

DeltaCheck is a web search and episodic memory verification agent. It resolves relative and explicit calendar references deterministically against the system clock, recalls matching prior turns from `./data/agent_memory.json`, dispatches 1–3 search queries concurrently, and synthesizes source-cited answers showing what changed—or remained unchanged—since the baseline conversation.

## Positioning

Unlike stateless web chat or opaque embedding-only RAG that guesses when asked "since Monday", DeltaCheck performs deterministic TypeScript calendar arithmetic, surfaces the recalled baseline turn alongside dispatched search queries in an inline ledger, and refuses to fabricate placeholder changes when no updates or search results exist.

## Operating Context

- Used interactively in a desktop or mobile browser (`src/ui/` served via `node:http` on `http://localhost:3000`) alongside the companion CLI REPL (`npm run cli`) and deterministic offline eval (`npm run cli -- --eval`).
- Frequently toggled between offline fixture mode (`SEARCH_PROVIDER=mock` via `npm run seed` data) and live API mode (`OPENAI_API_KEY` + `TAVILY_API_KEY` or `BRAVE_API_KEY`).
- Users switch between saved historical threads, submit follow-up checks with temporal references, inspect inline recalled baselines and query chips, expand inline citations, and open the `Sources & query log` modal.

## Capabilities and Constraints

- **Zero-build vanilla frontend**: `src/ui/index.html`, `src/ui/style.css`, and `src/ui/app.js` served statically by `src/server.ts` (`node:http`) with no bundler, framework, or runtime CSS preprocessor.
- **Preserve core features and controls**: Conversation history sidebar (`New thread`, thread list, delete button, provider/date telemetry), empty-state sample checks, SSE streaming activity status, differential baseline-vs-query ledger strip, collapsible inline sources, composer (`Enter` / `Shift+Enter`), and `Sources & query log` modal.
- **Honest verification**: Dates follow ISO `YYYY-MM-DD` and delta offsets (`-Nd`); citations link to canonical URLs or remain empty when offline mock data has no match.
- **Documentation boundary**: Visual design system specifications should merge alongside the existing backend architecture notes inside `DESIGN.md`.

## Brand Commitments

- Name: **DeltaCheck**
- Existing `DESIGN.md` technical architecture sections remain preserved when documenting the visual design system.

## Evidence on Hand

- `src/server.ts` HTTP/SSE backend (`/api/health`, `/api/conversations`, `/api/conversations/:id`, `/api/conversations/:id/messages`, `/api/search`).
- `src/seed.ts` deterministic baseline threads (`conv-monday-crm-shortlist` dated `2026-11-09` and `conv-nov3-postgres-hosting` dated `2026-11-03`).
- `src/agent.ts` deterministic date anchoring, `MemoryStore` matching, and parallel search fan-out.

## Product Principles

1. **Temporal provenance first**: Every recalled answer makes the anchor date, elapsed days, baseline topic, and exact search queries immediately scannable.
2. **Evidence beside claim**: Primary sources and query logs remain one click away (inline collapsible list and dedicated inspector modal) without cluttering reading flow.
3. **Calm operational clarity**: Prioritize scanability across threads, timestamps, metadata, and markdown tables/lists over decorative chrome.
4. **Honest offline parity**: Mock fixture mode and live search mode share identical interaction paths and clearly report active provider/model status.

