# DeltaCheck

DeltaCheck is a TypeScript web search and episodic memory chat agent with a modular web interface and CLI REPL. It resolves explicit and relative dates deterministically against the system clock, recalls matching prior conversation turns from user-isolated JSON storage, dispatches search queries in parallel, and synthesizes a source-cited answer comparing past baselines against current results.

## Prerequisites

- Node.js 20 or newer (tested on v24.15.0)
- npm 10 or newer

## Setup

```bash
npm install
cp .env.example .env
npm run seed
```

Without API keys configured in `.env`, DeltaCheck runs using the offline [`MockSearchClient`](src/services/search/mockSearchClient.ts) (fixture results for seeded CRM and Postgres topics; empty results for unknown queries) and a deterministic fallback synthesizer. Add `OPENAI_API_KEY` plus `TAVILY_API_KEY` or `BRAVE_API_KEY` in `.env` for live web search and LLM synthesis.

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

Run typechecking and automated unit/integration tests:

```bash
npx tsc --noEmit
npm test
```

Build compiled JavaScript to `dist/`:

```bash
npm run build
```

## Pipeline Architecture

Each user prompt runs through a three-stage pipeline in [`SearchAgent`](src/services/agent/searchAgent.ts):

1. **Stage 1 — Temporal Grounding & Routing (`stage1Route`)**: Resolves explicit dates (`3 November`), `N days ago`, `yesterday`, and weekday references (`Monday`, `last Tuesday`) deterministically in [`resolveTemporalAnchor`](src/services/agent/temporal.ts), queries the user's scoped [`MemoryStore`](src/storage/memoryStore.ts) slice for matching prior turns by date and token overlap, and emits 1–3 search queries.
2. **Stage 2 — Parallel Search (`stage2Search`)**: Runs queries concurrently with `Promise.all` through `ISearchClient` (`TavilySearchClient`, `BraveSearchClient`, or `MockSearchClient`) with shared abort-timeout fetch handling and canonical URL deduplication.
3. **Stage 3 — Synthesis (`stage3Synthesize`)**: Contrasts recalled baseline turns against retrieved search snippets and returns an answer with verified markdown citations.

## API Structure

All backend endpoints are exposed under both `/api/*` and `/api/v1/*` via [`ApiRouter`](src/api/router.ts), returning structured `{ error, code }` JSON error payloads on validation, auth, rate-limit, method-not-allowed (`405` + `Allow`), and upstream errors:

- `GET /api/v1/health` — Public clock/liveness readout (omits secrets and internal telemetry)
- `GET /api/v1/auth/me`, `POST /api/v1/auth/bootstrap`, `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` — `scrypt` authentication, HTTP-only SameSite-Strict HMAC cookies, and CSRF token issuance
- `GET|POST /api/v1/conversations`, `GET|DELETE /api/v1/conversations/:id`, `POST /api/v1/conversations/:id/messages` (SSE stream) — User-isolated thread persistence & real-time agent pipeline progress
- `GET /api/v1/admin/overview`, `GET /api/v1/admin/users`, `DELETE /api/v1/admin/users/:id`, `POST /api/v1/admin/seed`, `POST /api/v1/search` — RBAC-protected diagnostics (`SET`/`EMPTY` env redaction) and administration routes

## Configuration

All environment variables are loaded and validated in one centralized module ([`loadAppConfig`](src/config/env.ts)):

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP listening port (`0`–`65535`) | `3000` |
| `NODE_ENV` | Runtime mode (`production`, `development`, `test`) | `production` |
| `OPENAI_API_KEY` | OpenAI API key for routing and synthesis | None (heuristic fallback) |
| `OPENAI_MODEL` | OpenAI chat completion model | `gpt-4o` |
| `SEARCH_PROVIDER` | Search backend (`tavily`, `brave`, `mock`) | `tavily` |
| `TAVILY_API_KEY` | Tavily API key | None |
| `BRAVE_API_KEY` | Brave Search API key | None |
| `STORAGE_PATH` | Path to JSON conversation store inside workspace/`/tmp` | `./data/agent_memory.json` |
| `SESSION_SECRET` | HMAC session signing secret (`>= 32` chars) | Ephemeral per-boot random |
| `DATA_ENCRYPTION_KEY` | Optional 64-hex or base64 32-byte key for AES-256-GCM at rest | None (`0600` plaintext) |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed cross-origins | Same-origin only |
| `TRUST_PROXY` | Honor `X-Forwarded-For` / `X-Forwarded-Proto` when `true` | `false` |
| `COOKIE_SECURE` | Force `Secure` cookie attribute even behind non-TLS dev proxies | `false` |
| `ALLOW_REGISTRATION` | Allow self-service user registration after bootstrap (`false` disables) | `true` |
| `ADMIN_USERNAME` | Optional headlessly bootstrapped admin handle (`3-32` chars) | None |
| `ADMIN_PASSWORD` | Optional headlessly bootstrapped admin password (`>= 10` mixed chars) | None |

## Repository Layout

```text
src/
  config/
    env.ts                   Centralized dotenv + validated AppConfig & redacted status
  types/
    index.ts                 Core domain, API, search, and authentication interfaces
  security/
    errors.ts                Typed AppError hierarchy mapped to HTTP status/codes
    crypto.ts                AES-256-GCM encryption, safe JSON parse, constant-time compare
    validation.ts            Sanitization, ID/credential validators, safe path & body parsers
    httpSecurity.ts          Security/CSP headers, CORS/Origin checks, proxy IP, RateLimiter
  storage/
    jsonPersistence.ts       Shared atomic 0o600 plaintext/encrypted JSON persistence helper
    memoryStore.ts           User-scoped JSON MemoryStore with temporal/entity retrieval
    authStore.ts             Salted scrypt password hashing, HMAC sessions & CSRF store
    seed.ts                  Starter dataset seeder and CLI script
  services/
    search/
      httpSearchClients.ts   Shared timeout fetch, URL canonicalization, Tavily & Brave clients
      mockSearchClient.ts    Offline fixture search provider
      index.ts               Search factory (`createSearchClient`) and public exports
    agent/
      temporal.ts            Deterministic calendar math (`resolveTemporalAnchor`)
      searchAgent.ts         Three-stage agent pipeline (route, parallel search, synthesize)
  api/
    router.ts                ApiRouter, `/api/v1/*` alias, 405 + `Allow`, error boundary
    helpers.ts               Auth/RBAC/CSRF guards, rate limits, param validation, JSON replies
    staticServer.ts          Safe nested asset server blocking dotfiles and path traversal
    server.ts                HTTP composition root and graceful shutdown
    routes/                  health.ts, auth.ts, conversations.ts, admin.ts
  cli/
    index.ts                 CLI REPL and `--eval` runner
  ui/
    index.html               Document shell & auth/inspector/admin dialogs
    style.css                Stylesheet manifest importing `styles/*.css`
    styles/                  tokens.css, base.css, workspace.css, modals.css
    js/
      main.js                App bootstrap wiring store, API client, and components
      state/store.js         Observable central state store & continuum/source selectors
      services/apiClient.js  Typed HTTP/SSE client with CSRF injection & `ApiError`
      utils/                 format.js (dates, XSS-safe Markdown), dom.js
      components/            ErrorBanner, AuthGate, Sidebar, ChatView, SourcesModal, AdminModal
test/
  unit/                      security.test.ts, agent.test.ts
  integration/               storage.test.ts, api.test.ts
```

## License

MIT — see [LICENSE](LICENSE).
