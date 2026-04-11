# Exploration log

**Purpose:** Persistent memory across human and AI sessions. When context windows reset, this file is the handoff: **which system pathways deserve a pass**, what was learned, and what is still unknown.

**How to use**

- Append or edit rows; use **ISO dates** (`YYYY-MM-DD`) in **Notes** when you add substance.
- **Status:** `not_started` | `in_progress` | `done` | `parked` (intentionally deferred).
- **Priority:** `P0` (user-facing failure or data loss risk) → `P3` (cleanup).
- Prefer **links to code** over long prose. One or two sentences per cell is enough.
- Do **not** duplicate [ARCHITECTURE.md](ARCHITECTURE.md); link paths and move on.

**Related:** [README.md](README.md) (opening paragraph: picking up after a break), [AGENTS.md](AGENTS.md) § Session continuity (commands, SSE diagnostics), [ARCHITECTURE.md](ARCHITECTURE.md) (module map), [DOCUMENTATION.md](DOCUMENTATION.md) (doc set rules).

---

## Pathways

| ID | Pathway | Priority | Status | Entry points / seams | Notes |
|----|---------|----------|--------|----------------------|-------|
| E1 | **HTTP API surface** — validation, error shape, SSE vs JSON | P0 | in_progress | [server/app.ts](server/app.ts), [server/lib/parse-request.ts](server/lib/parse-request.ts), [server/routes/__tests__/](server/routes/__tests__/) | Route-level tests exist for generate, incubate, inputs-generate, design-system extract, config, preview pieces, logs/trace schema, production gates. **Gap to confirm:** `models`, `hypothesis` beyond schema-only tests. |
| E2 | **Prompt and skill loading** — wrong prompt = silent wrong behavior | P0 | in_progress | [server/lib/prompt-resolution.ts](server/lib/prompt-resolution.ts), [server/lib/prompt-templates.ts](server/lib/prompt-templates.ts), [server/lib/skill-discovery.ts](server/lib/skill-discovery.ts), `skills/*/SKILL.md` | Table-driven tests added under `server/lib/__tests__/`. Invalid YAML frontmatter still skips skills at discovery — see DOCUMENTATION.md maintenance item. |
| E3 | **Agentic generation pipeline** — orchestration, abort, SSE delivery | P0 | not_started | [server/services/generate-execution.ts](server/services/generate-execution.ts), [server/services/agentic-orchestrator/](server/services/agentic-orchestrator/), [server/services/pi-session-event-bridge.ts](server/services/pi-session-event-bridge.ts) | Correlate `correlationId` across `[agentic-orchestrator]`, `[generate:SSE]`, `[write-gate]`, `[bridge]` (AGENTS.md). |
| E4 | **Task-agent SSE** (incubate, inputs-gen, design-system) | P1 | not_started | [server/lib/sse-task-route.ts](server/lib/sse-task-route.ts), [server/services/task-agent-execution.ts](server/services/task-agent-execution.ts) | `(task:SSE)` write summaries in dev. |
| E5 | **Client SSE + API client** | P1 | in_progress | [src/api/](src/api/) (`client.ts` barrel + `client-rest` / `client-sse` / `client-task-stream` / `client-shared`), [src/lib/sse-diagnostics.ts](src/lib/sse-diagnostics.ts), `window.__SSE_DIAG` | Strict vs loose parsing per stream type — maintain when touching handlers. |
| E6 | **Preview sessions + iframe** | P1 | not_started | [server/routes/preview.ts](server/routes/preview.ts), preview limits tests | Ephemeral sessions / serverless — README Deploying section. |
| E7 | **Zustand stores + persistence** | P2 | not_started | Canvas / generation stores, IndexedDB | Store smoke tests: avoid full `reset()` in Vitest node if it touches IDB — use targeted `setState`. |
| E8 | **Observability and eval artifacts** | P2 | in_progress | [server/lib/observability-sink.ts](server/lib/observability-sink.ts), [server/lib/eval-run-logger.ts](server/lib/eval-run-logger.ts) | NDJSON / eval run logs on disk. Unit tests under `server/lib/__tests__/` cover file-line helpers and eval log writes (mocked fs). |
| E9 | **Dead code and dependencies** | P3 | in_progress | `pnpm knip` — [knip.json](knip.json) | Variable fonts referenced from [src/fonts/latin-subsets.css](src/fonts/latin-subsets.css) — `ignoreDependencies` silences false unused reports for `@fontsource-variable/*`. Re-run knip after dep changes. |
| E10 | **Meta-harness (separate CLI)** | P3 | not_started | [meta-harness/README.md](meta-harness/README.md), [meta-harness/RUNBOOK.md](meta-harness/RUNBOOK.md) | Not the designer app; own versioning under `.prompt-versions/`. |

---

## Session notes (chronological)

Append newest first.

| Date | Note |
|------|------|
| 2026-04-11 | Initial pathway table seeded from architecture map + hardening focus. **E9:** Knip `ignoreDependencies` for font packages used only via CSS paths. **E1:** `design-system` extract route test added. |
| 2026-04-11 | README + AGENTS + DOCUMENTATION now describe **session continuity** (no chat memory; read this log first; leave notes for the next session). |
| 2026-04-11 | **Shipped hardening batch:** route + lib tests (prompt resolution/templates, eval logger, observability sink, generate + design-system routes, HTML validation), Pi bridge modules (`pi-bridge-*`), `pi-tool-params`, API client split, skill-discovery cleanup, `createWriteGate` import from `sse-write-gate` only, knip `ignoreDependencies` for CSS-referenced fonts, docs (EXPLORATION_LOG, ARCHITECTURE API client table). |
| 2026-04-11 | Pushed: **`5ce1f58`** — full message in `git log -1`; use as anchor for this hardening wave. |
