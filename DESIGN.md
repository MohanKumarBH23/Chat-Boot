---
name: DeltaCheck
description: Emission Line Continuum — dark optical-spectroscopy workbench for deterministic temporal memory recall and live source verification.
colors:
  sodium-gold: "#ffcf48"
  sodium-line: "rgba(255, 207, 72, 0.36)"
  cyan-query: "#4cc9f0"
  emerald-verified: "#5ec27e"
  crimson-destructive: "#f07167"
  continuum-ground: "#101214"
  rail-surface: "#131619"
  plate-surface: "#181b1e"
  plate-active: "#1d2227"
  rule-hairline: "#282d33"
  rule-axis: "#363c44"
  rule-strong: "#3a4048"
  ink-bone: "#ebe8df"
  ink-secondary: "#b9b4a8"
  ink-muted: "#989388"
typography:
  display:
    fontFamily: "Work Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Work Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "22px"
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Work Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "20px"
  body:
    fontFamily: "Work Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "22px"
  label:
    fontFamily: "Spline Sans Mono, ui-monospace, 'Cascadia Mono', monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "16px"
    fontFeature: "tnum"
rounded:
  none: "0px"
  sharp: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  base: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.sodium-gold}"
    textColor: "{colors.continuum-ground}"
    typography: "{typography.label}"
    rounded: "{rounded.sharp}"
    padding: "0 14px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.plate-surface}"
    textColor: "{colors.ink-bone}"
    rounded: "{rounded.sharp}"
    padding: "0 12px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.plate-active}"
  button-compact:
    backgroundColor: "{colors.plate-surface}"
    textColor: "{colors.ink-bone}"
    rounded: "{rounded.sharp}"
    padding: "0 10px"
    height: "30px"
  button-compact-hover:
    backgroundColor: "{colors.plate-active}"
  button-icon:
    backgroundColor: "{colors.plate-surface}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sharp}"
    width: "32px"
    height: "32px"
  button-icon-hover:
    backgroundColor: "{colors.plate-active}"
    textColor: "{colors.ink-bone}"
  input-composer:
    backgroundColor: "{colors.plate-surface}"
    textColor: "{colors.ink-bone}"
    typography: "{typography.body}"
    rounded: "{rounded.sharp}"
    padding: "8px 8px 8px 16px"
  nav-thread-row:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.none}"
    padding: "2px 4px 2px 0"
  nav-thread-row-hover:
    backgroundColor: "{colors.plate-surface}"
    textColor: "{colors.ink-bone}"
  nav-thread-row-active:
    backgroundColor: "{colors.plate-active}"
    textColor: "{colors.ink-bone}"
  plate-assistant:
    backgroundColor: "{colors.plate-surface}"
    textColor: "{colors.ink-bone}"
    rounded: "{rounded.none}"
    padding: "22px 24px"
  modal-inspector:
    backgroundColor: "{colors.plate-surface}"
    textColor: "{colors.ink-bone}"
    rounded: "{rounded.sharp}"
    width: "680px"
---

# Design System: DeltaCheck

## Overview

**Creative North Star: "The Emission Line Continuum"**

DeltaCheck is built as an optical-spectroscopy verification instrument rather than a soft conversational messenger. Saved threads hang as calibrated cross-ticks along an off-centre vertical rail beside a dark specimen stream, where unboxed, hairline-ruled charcoal plates separate your questions from DeltaCheck's baseline-anchored verification findings.

Rather than decorating containers with drop shadows or rounded pills, meaning rides on narrow spectral emission lines against cool charcoal ash and warm bone typography. Doubled sodium-gold bars anchor historical dates and active baselines, single cyan lines mark live search queries and earliest continuum points, and single emerald lines confirm verified live responses.

**Key Characteristics:**
- Dark charcoal tonal layering (`#101214` to `#1d2227`) bounded by `1px` solid hairlines with zero drop shadows.
- Strict spectral color coding: doubled `#ffcf48` sodium gold for temporal baselines and primary dispatch, `#4cc9f0` cyan for live search queries and links, `#5ec27e` emerald for verified live state.
- Dual-voice typography pairing geometric `Work Sans` prose with `Spline Sans Mono` tabular dates, deltas, and query logs.
- Unrounded (`0px`) full-bleed reading bands and ledger strips paired with sharp (`2px`) controls and framing surfaces.

## Colors

A low-glare cool-charcoal spectrum warmed by bone-tinted inks and punctured only by narrow, high-contrast spectral emission accents.

### Primary
- **Sodium Gold** (`#ffcf48`): Doubled spectral emission needle (`5px` pair of `1.5px` bars), active sidebar rail indicator, temporal anchor stamp (`.delta-stamp`), primary `Dispatch` submit button fill, inline markdown `<code>` text, composer `:focus-within` border, keyboard `:focus-visible` outline, text caret, and link/summary hover accent.
- **Sodium Emission Line** (`rgba(255, 207, 72, 0.36)`): `1px` perimeter border framing the live streaming `.activity-card` while Stage 1 routing and Stage 2 parallel queries run.

### Secondary
- **Query Cyan** (`#4cc9f0`): Single `1.5px` spectral emission mark for live search query rows (`.emit-mark.live-cyan`), idle/earliest continuum ruler ticks, sample prompt idle bars, inline markdown hyperlinks, `.sources-summary` bar, `Sources` search lens icon, and secondary/compact button hover borders.

### Tertiary
- **Verified Emerald** (`#5ec27e`): Single `1.5px` emission bar on `.verified-stamp`, live provider status indicator in the sidebar footer when `searchProvider !== 'mock'`, and live-check continuum ruler tick once a turn completes with latency metadata.
- **Destructive Coral** (`#f07167`): Hover text color on thread deletion buttons (`.thread-del-btn:hover`), paired with a translucent `rgba(240, 113, 103, 0.35)` border and `rgba(240, 113, 103, 0.12)` surface wash.

### Neutral
- **Continuum Ground** (`#101214`): Root viewport background (`html`, `body`), scrollbar track, inline `<code>` well, and high-contrast ink on the sodium-gold `Dispatch` button.
- **Rail Surface** (`#131619`): Calibrated `264px` sidebar background, `56px` workspace topbar, bottom composer dock, markdown table headers, and modal header band.
- **Plate Surface** (`#181b1e`): Assistant response plates, secondary/compact/icon buttons, composer input box, keycaps, activity card, modal panel, and thread row hover background.
- **Plate Active** (`#1d2227`): Active thread selection fill, button hover fill, and source row hover fill.
- **Rule Hairline** (`#282d33`): Default `1px` structural border across shell panes, resting buttons, prompt/source row dividers, ledger strip dividers, markdown table gridlines, and scrollbar thumb.
- **Rule Axis** (`#363c44`): `1px` vertical calibrated timeline rail (`.threads-list::before`).
- **Rule Strong** (`#3a4048`): Emphasized `1px` top and bottom rules on assistant plates, active thread rows, continuum ruler bottom edge, composer border, keycaps, modal frame, and inspector turn dividers.
- **Bone Ink** (`#ebe8df`): Primary headings, body prose, assistant/user labels, active thread titles, and button labels.
- **Secondary Ash Ink** (`#b9b4a8`): Empty-state guidance copy, list items, baseline topic summary, query line text, table headers, source summaries, keycap labels, and modal snippets.
- **Muted Ash Ink** (`#989388`): Timestamps, thread/source counts, section headers, input placeholders, keyboard hint labels, and source domain/date metadata.

### Named Rules
**The Spectral Separation Rule.** Reserve doubled sodium gold (`#ffcf48`) strictly for temporal baselines, active thread selection, the primary `Dispatch` control, and keyboard focus; reserve cyan (`#4cc9f0`) for live search queries, earliest/idle continuum ticks, hyperlinks, and hover affordances; and reserve emerald (`#5ec27e`) strictly for verified live state.

**The High-Contrast Ash Ink Rule.** Render all text and structural rules from warm ash-bone inks (`#ebe8df`, `#b9b4a8`, `#989388`) and cool slate charcoals (`#101214`–`#3a4048`) rather than pure `#ffffff` white or uncalibrated neutral grays.

## Typography

**Display Font:** Work Sans (with `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` fallback)
**Body Font:** Work Sans (with `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` fallback)
**Label/Mono Font:** Spline Sans Mono (with `ui-monospace, 'Cascadia Mono', monospace` fallback)

**Character:** Crisp, neutral geometric sans prose paired with technical monospaced telemetry so English findings remain effortless to scan while dates, deltas, and search queries read like instrument readouts.

### Hierarchy
- **Display** (`600`, `30px` desktop / `24px` at `<=768px`, `1.15` line-height, `-0.025em` tracking): Empty-state heading (`.empty-title`) introducing temporal check workflows.
- **Headline** (`600`, `16px`, `22px` line-height; `.brand-name` uses `line-height: 1` and `-0.015em` tracking): Markdown `h3`/`h4` subheadings inside assistant findings and the top-left `DeltaCheck` wordmark.
- **Title** (`500`–`600`, `15px`, `20px` line-height): Workspace topbar thread title (`.thread-title`, `500`) and inspector dialog title (`.modal-title`, `600`).
- **Body** (`400`, `14px`, `22px` line-height, `max-width: 74ch` in `.markdown-body` and `68ch` in `.empty-copy`): Primary conversation prose, prompt rows, and composer textarea; paired with a `13px` (`18px`–`20px` line-height) compact body tier for sidebar thread titles, baseline topics, markdown tables, source item titles, secondary button labels, and inspector snippets.
- **Label** (`400`–`600`, `11px`–`12px`, `15px`–`16px` line-height, `tabular-nums`): `Spline Sans Mono` `11px` telemetry for `.delta-stamp`, `.verified-stamp`, `.continuum-ruler`, `.query-line`, `.markdown-body th`, `.thread-row-date`, `.status-text`, `.clock-meta`, `.count-meta`, `.source-item-meta`, `.keycap`, and `.tool-meta`; `12px` for `.date-stamp`, `.sources-summary`, `.activity-label`, inline `<code>`, `.section-label`, `.compact-btn`, and `.send-btn` (`Spline Sans Mono`, `600`, `0.02em` tracking).

### Named Rules
**The Tabular Telemetry Rule.** Apply `Spline Sans Mono` with `font-variant-numeric: tabular-nums` to every ISO date (`YYYY-MM-DD`), day offset (`-Nd`), counter, latency readout, continuum tick, and markdown table so numerical comparisons align vertically across turns.

## Layout

A full-viewport (`100vh`) two-column workbench (`app-shell`) backed by a subtle horizontal continuum vignette (`linear-gradient(90deg, rgba(16, 18, 20, 0.96) 0%, rgba(28, 32, 36, 0.35) 68%, rgba(16, 18, 20, 0.96) 100%)` over `#101214`).

- **Calibrated Left Rail (`.sidebar`)**: Fixed `264px` width on desktop, divided into a `56px` min-height `.sidebar-header` (`12px 16px` padding), scrollable thread list (`.sidebar-scroll`, `16px 12px` padding) anchored along a `1px` vertical axis `6px` from the inner left edge (`14px` left list padding), and a hairline-separated `.sidebar-footer` (`12px 16px` padding) displaying live provider telemetry and system clock.
- **Main Workspace (`.workspace`)**: Flex column containing the `56px` min-height `.topbar` (`12px 24px` padding), the full-width `.continuum-ruler` (`9px 24px 12px` padding with a `5px`-tall `28px`-pitch tick scale along the bottom edge), the scrollable `.stream-scroll` viewport (`28px 28px 36px` padding) housing a centered `900px` max-width `.reading-column` (`24px` vertical gap between empty-state, message list, and live activity band), and the pinned `.composer-bar` (`16px 24px 20px` padding, `820px` max-width `.composer-form`).
- **Inspector Modal (`.modal-panel`)**: Centered `680px` max-width (`max-height: 80vh`) overlay dialog over a `rgba(8, 10, 12, 0.78)` backdrop, with `24px` outer viewport margin and `20px` body padding.
- **Mobile Breakpoint (`@media (max-width: 768px)`)**: Collapses `.sidebar` into a fixed off-canvas drawer (`translateX(-100%)` over a `rgba(8, 10, 12, 0.72)` scrim), reveals the `.mobile-only` `History` toggle button, hides `.date-stamp` and `.key-hint`, widens `.thread-del-btn` hit areas from `28px` to `36px`, wraps `.continuum-ruler` ticks (`6px 14px` gap), tightens stream/topbar/composer horizontal padding to `16px`, and stacks `.prompt-row` and `.source-item` rows vertically.

## Elevation & Depth

**No drop shadows are used anywhere in the system (`box-shadow: none`).** Depth and surface separation rely strictly on tonal charcoal stepping (`#101214` continuum ground → `#131619` rail and dock chrome → `#181b1e` specimen plates and controls → `#1d2227` active and hover states) paired with crisp `1px` structural borders (`#282d33` hairline, `#363c44` timeline axis, `#3a4048` strong boundary). Overlays use solid modal framing (`1px solid #3a4048`) over darkened scrims (`rgba(8, 10, 12, 0.78)` for the modal backdrop, `rgba(8, 10, 12, 0.72)` for the mobile drawer scrim) without blur filters.

### Named Rules
**The Flat-Plate Tonal Rule.** Never introduce `box-shadow`, elevation glows, or backdrop blur; establish hierarchy exclusively through stepped charcoal luminance and `1px` solid hairlines.

## Shapes

The form language pairs flat, unrounded (`0px`) horizontal bands with sharp (`2px` via `--radius-sharp`) discrete controls and framed overlays:

- **Unrounded Bands (`0px`)**: Thread rows (`.thread-row`), user turns (`.message-card.user`), assistant specimen plates (`.message-card.assistant`), inline differential ledger strips (`.ledger-strip`), sample check rows (`.prompt-row`), and source citation rows (`.source-item`) sit edge-to-edge across their column separated only by `1px` top and bottom hairlines—never nested inside floating rounded cards.
- **Sharp Controls & Frames (`2px`)**: All buttons (`.send-btn`, `.secondary-btn`, `.compact-btn`, `.icon-btn`, `.thread-del-btn`), input surfaces (`.composer-box`, `.keycap`), inline `<code>` tokens, `.markdown-table-wrap`, `.activity-card`, and `.modal-panel` use a uniform `2px` corner radius.
- **Optical Tick Geometry**: Provenance markers avoid pill badges in favor of narrow vertical bars—single `1.5px` cyan or emerald slits and `5px`-wide (`1.5px` gold / `2px` gap / `1.5px` gold) doubled sodium emission needles—plus `6px × 1px` horizontal rail cross-ticks that morph to `2px × 18px` cyan bars on hover and `5px × 26px` doubled sodium bars when active.

## Components

### Buttons
Sharp (`2px`) rectangular controls with `140ms cubic-bezier(0.22, 1, 0.36, 1)` transitions and `transform: scale(0.98)` tactile press feedback.
- **Primary (`Dispatch` / `.send-btn`)**: Solid `#ffcf48` sodium gold fill, `#101214` dark ink, `Spline Sans Mono` `12px` `600` (`0.02em` letter-spacing), `32px` height, `0 14px` padding; dims to `0.9` opacity on hover and `0.38` when disabled.
- **Secondary (`Sources` / `.secondary-btn`)**: `#181b1e` fill, `1px solid #282d33` hairline, `32px` height, `0 12px` padding, `16px` cyan search lens icon and tabular count badge; shifts to `#1d2227` fill and `#4cc9f0` cyan border on hover.
- **Compact (`+ New`, mobile `History` / `.compact-btn`)**: `#181b1e` fill, `1px solid #282d33` hairline, `30px` height, `0 10px` padding, `12px` label with `14px` icon; shifts to `#1d2227` fill and `#4cc9f0` cyan border on hover.
- **Icon Close (`.icon-btn`)**: `32px × 32px` square in `#181b1e` with `#282d33` border; shifts to `#1d2227`, `#3a4048` border, and `#ebe8df` ink on hover.
- **Destructive Delete (`.thread-del-btn`)**: `28px × 28px` (`36px × 36px` mobile) ghost trigger inside thread rows at `0.45` resting opacity (`1` on row hover/focus/active); turns `#f07167` coral with `rgba(240, 113, 103, 0.35)` border and `rgba(240, 113, 103, 0.12)` background on hover.
- **Focus Ring**: Global `:focus-visible` renders a `2px solid #ffcf48` outline with `2px` offset across all interactive controls.

### Inputs / Fields
Tactile, hairline-framed prompt dock (`max-width: 820px`) built for keyboard-first temporal queries.
- **Style**: `.composer-box` sets `#181b1e` background, `1px solid #3a4048` border, `2px` radius, and `8px 8px 8px 16px` padding around an auto-resizing transparent `<textarea>` (`24px`–`160px` height, `14px`/`22px` `Work Sans`, `#989388` placeholder, `#ffcf48` caret).
- **Focus**: `.composer-box:focus-within` shifts its `1px` perimeter directly to `#ffcf48` sodium gold with no outer glow.
- **Footer Hints**: `.composer-meta` renders `2px`-framed `<kbd>` keycaps (`#181b1e` fill, `1px solid #3a4048`, `11px` mono) and the active search provider readout.

### Navigation
Calibrated vertical thread index suspended from the left rail axis (`1px solid #363c44`).
- **Default Row (`.thread-row`)**: Unrounded `44px` min-height row with `13px` truncated title, `11px` tabular date, and a resting `6px × 1px` `#3a4048` cross-tick spur on the left rail.
- **Hover / Active States**: Hovering paints `#181b1e` between `#282d33` top/bottom rules and raises a `2px × 18px` `#4cc9f0` cyan tick; the `.active` row paints `#1d2227` between `#3a4048` rules and displays the `5px × 26px` doubled `#ffcf48` sodium needle.
- **Telemetry Footer (`.sidebar-footer`)**: Pairs a `2px × 12px` vertical bar (`#ffcf48` in mock mode, `#5ec27e` when live) with `provider · model` and the current `YYYY-MM-DD` clock.

### Cards / Containers
Unboxed hairline-ruled horizontal bands rather than shadowed cards.
- **Specimen Message Plates (`.message-card`)**: Enter with a `180ms` (`enterRow`) `4px` upward settle. User turns sit transparently (`16px 4px` padding) beneath a `1px solid #282d33` top rule; assistant turns fill `#181b1e` (`22px 24px` padding) between `1px solid #3a4048` top and bottom rules.
- **Differential Ledger Strip (`.ledger-strip`)**: Hairline-bounded (`1px solid #282d33` top/bottom) band inside assistant plates listing the recalled `Baseline:` topic behind a doubled `#ffcf48` `.emit-mark` and each executed query behind a `1.5px` `#4cc9f0` `.emit-mark.live-cyan`.
- **Activity Band (`.activity-card`)**: Streaming status plate framed in `1px solid rgba(255, 207, 72, 0.36)` (`2px` radius, `16px 20px` padding) showing Stage 1/2 progress, dynamic `.delta-stamp`, and live cyan query rows.
- **Collapsible Inline Sources & Inspector Modal**: `.sources-details` unfolds `.source-item` rows directly beneath markdown prose (`1px` `#282d33` dividers, `1.5px` inset left bar shifting `#3a4048` → `#4cc9f0` cyan on `#1d2227` hover). `.modal-panel` (`680px` max-width, `1px solid #3a4048`, `2px` radius) aggregates per-turn queries and snippets in `.inspector-turn` blocks.

### Continuum Ruler & Emission Stamps
- **Temporal Continuum Ruler (`.continuum-ruler`)**: Persistent workspace calibration bar (`linear-gradient(90deg, #121518 0%, #1a1e23 50%, #121518 100%)`) with a `28px`-pitch subtle scale hatch along its bottom `1px solid #3a4048` edge, spacing three tabular ticks: Earliest (`1.5px` cyan), Anchor/Baseline (`5px` doubled sodium gold), and Live check (`1.5px` cyan before execution, shifting to `#5ec27e` emerald `Verified live` after completion).
- **Emission Stamps (`.delta-stamp` & `.verified-stamp`)**: Inline `11px` `Spline Sans Mono` status readouts prefixed with `::before` spectral bars—doubled `5px × 14px` sodium gold for temporal deltas (`2026-11-09 · -2d`) and single `1.5px × 14px` emerald for `Verified live` / `Checked` completions.

## Do's and Don'ts

### Do:
- **Do** encode semantic meaning through the three spectral emission lines (`#ffcf48` doubled sodium for temporal anchors/focus/dispatch, `#4cc9f0` cyan for live search queries/links, `#5ec27e` emerald for verified live state).
- **Do** separate message plates, ledger strips, prompt suggestions, and source citations using full-bleed `0px`-radius bands bounded by `1px` hairlines (`#282d33` / `#3a4048`).
- **Do** format every date, delta offset, count, latency, and table column in `Spline Sans Mono` with `font-variant-numeric: tabular-nums`.
- **Do** pair `2px` sharp radii (`--radius-sharp`) across buttons, composer framing, keycaps, table wrappers, and modal surfaces, keeping hover/active feedback crisp at `140ms cubic-bezier(0.22, 1, 0.36, 1)`.
- **Do** preserve `prefers-reduced-motion: reduce` overrides disabling row entrance animations and transitions.

### Don't:
- **Don't** add `box-shadow`, outer glow halos, or `backdrop-filter` blur to plates, buttons, or modals (`The Flat-Plate Tonal Rule`).
- **Don't** wrap message plates, baseline topics, or search queries in nested rounded cards or pill-shaped chips (`>=4px` / `999px` radii).
- **Don't** substitute `#ffcf48` sodium gold onto secondary buttons or routine links, or mix cyan and emerald roles across status indicators.
- **Don't** insert eyebrow/kicker labels above headings, decorative section numbers, or emoji/Unicode glyphs in place of authored `1.5px`-stroke SVGs.
- **Don't** drop tabular numerals or let prose measures expand past `74ch` inside `.markdown-body`.

## Architecture & Engineering Choices

### Problem

Conversational search tools struggle on follow-up questions that anchor to past interactions by date (for example, "What changed since Monday?" or "What did I ask on 3 November?"). Three issues appear regularly:

1. **Serial ReAct latency**: Alternating LLM calls and single search queries scales wall-clock time linearly with query count.
2. **Weak temporal matching in vector search**: Embedding similarity groups topics well but handles relative calendar phrases poorly.
3. **Fabricating changes when nothing changed**: When live search shows no price increase or announcement, unconstrained synthesis often invents changes rather than confirming stability.

### Design Choices

#### Three-Stage Pipeline (`src/agent.ts`)

Instead of an unbounded tool-calling loop, each turn executes at most two LLM calls (routing and synthesis) with one concurrent search fan-out between them:

- **Stage 1 (`stage1Route`)**: Computes the current date and resolves relative phrases (`Monday`, `last Tuesday`, `3 November`, `2 days ago`) in deterministic TypeScript before any LLM call. Queries `MemoryStore` for matching prior turns and generates 1–3 targeted queries. Greetings skip Stage 2.
- **Stage 2 (`stage2Search`)**: Dispatches queries concurrently via `Promise.all` and deduplicates results by canonical URL (`utm_*`, `ref`, `source`, `fbclid`, fragment, and trailing slash stripped).
- **Stage 3 (`stage3Synthesize`)**: Receives the recalled prior exchange alongside deduplicated search results and contrasts baseline facts against retrieved snippets. When running offline without an API key, `MockSearchClient` returns empty results for unknown topics rather than synthetic placeholder URLs.

**Trade-off**: Planning queries upfront avoids serial hops and keeps latency predictable, at the cost of not issuing follow-up searches mid-turn if initial results point to an unexpected entity.

#### Calendar Arithmetic Outside the LLM

Date resolution in `SearchAgent.getTemporalAnchor` runs in code using word-boundary regexes and `Date` arithmetic. When multiple weekdays appear in one sentence, explicit `last <weekday>` expressions take priority over bare weekday names so phrases like "Last Tuesday I compared Monday's rates" resolve cleanly.

#### JSON Episodic Memory (`src/memory.ts`)

Conversations are stored as paired user/assistant turns in `./data/agent_memory.json` with extracted entity metadata:

- When a reference date (`YYYY-MM-DD`) is resolved, `findTurnByDateOrEntity` collects all turns matching that date and ranks them by token overlap with the prompt, breaking ties by most recent timestamp.
- Writes go through a temporary file (`agent_memory.json.tmp`) followed by `fs.renameSync` to avoid corrupting the store on interrupted writes.

**Trade-off**: Loading the conversation map into memory keeps lookups fast for personal history sizes (hundreds to a few thousand turns). Scaling to multi-user or large archives would require SQLite or a dedicated database.

#### Web Server & UI (`src/server.ts`, `src/ui/`)

The web server uses Node's built-in `node:http` module to serve the zero-build static frontend (`src/ui/index.html`, `src/ui/style.css`, `src/ui/app.js`) and stream Stage 1 / Stage 2 progress over Server-Sent Events (`POST /api/conversations/:id/messages`), keeping runtime dependencies limited to `dotenv` and `openai`.
