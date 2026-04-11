# [AGENTS.md](http://AGENTS.md)

**Canonical instructions for AI coding agents** working in this repository—commands, where to read architecture (including Pi/just-bash sandbox), and gotchas. Follows the vendor-neutral [AGENTS.md](https://agents.md) convention (Cursor, Codex, Windsurf, and similar tools commonly load this filename).

**Claude Code** still discovers `**CLAUDE.md`** at the repo root first; that file is a **stub** pointing here. **Do not confuse** this document with the `**agents-md-file`** skill: its instructions are surfaced as a **virtual** `AGENTS.md` under `/home/user/project` inside the **Pi design sandbox** only (output rules for generated artifacts), not this developer-facing file.

## North Star

Read [PRODUCT.md § North Star](PRODUCT.md#north-star) before making any design or architecture decision. If a change does not serve that ambition, question whether it belongs.

## Release metadata

**Patch** (`x.y.Z` last segment): auto-incremented on every local `**git commit`** by Husky (`.husky/pre-commit` → `scripts/bump-patch-version.ts`, logic in `src/lib/semver-bump-patch.ts`). **Major and minor** (`x.y`) change only when you edit `**version`** in root `**package.json`** manually (e.g. `0.4.0`); the next commit then bumps patch to `0.4.1`. Skip the bump for a one-off commit: `SKIP_PATCH_BUMP=1 git commit ...`. CI (`CI=true`) never runs the bump.

The header's **date/time** comes from `**git log -1 --format=%cI`** (committer time of `HEAD`) when Vite loads — no manual timestamp. If you ship a tree **without** `.git`, set optional `**releasedAt`** in `package.json` (ISO-8601); `vite.config.ts` falls back to it. Display is always **America/New_York** (EST/EDT) in the UI.

**Version and timestamp in the header are baked in when Vite starts** (`vite.config.ts` `define`). After you change `package.json` or make a new `git commit`, **restart `pnpm dev`** / `**pnpm dev:all**` (or run `pnpm build` / `pnpm preview`) so the canvas header shows the updated `v…` and Eastern time — a running dev server does not pick up new values on its own.

`**git commit --amend**` runs the hook again and bumps patch again; avoid amending often or use `SKIP_PATCH_BUMP=1` if the version was already correct for that commit.

## Commands

```bash
# Development (API + Vite — avoids proxy ECONNREFUSED race)
pnpm dev:all         # API first, then Vite after http://localhost:3001/api/health
pnpm dev:kill        # Free ports 3001 and 5173 (stuck dev servers)
# Or two terminals: pnpm dev:server  and  pnpm dev
pnpm dev             # Vite frontend at http://localhost:5173 (strict port — localStorage origin)
pnpm dev:server      # Hono API server at http://localhost:3001

# Build & lint
pnpm build           # tsc -b && vite build
pnpm lint            # eslint

# Tests
pnpm test            # vitest run (one-shot)
pnpm test:watch      # vitest (watch mode)
pnpm vitest run src/hooks/__tests__/resolve-evaluator-settings.test.ts  # single test file
```

Vitest excludes `server/services/__tests__/browser-playwright-evaluator.test.ts` via `vite.config.ts` so the default suite stays hermetic; run that file explicitly when changing Playwright merge logic. Pi virtual FS tools are covered in `server/services/pi-sdk/__tests__/virtual-tools.test.ts`.

## Architecture (quick reference)

**Full technical reference:** [ARCHITECTURE.md](ARCHITECTURE.md) — routes, server modules, client stores, canvas, generation (agentic Pi sandbox + optional auto-improve loop), preview URLs, Pi NPM boundary. **Pi design sandbox** (three-layer contract, **tool inventory** table, edit cascade / `edit-match-cascade.ts`): [ARCHITECTURE.md § Pi design sandbox](ARCHITECTURE.md#pi-design-sandbox-three-layer-contract).

**Prompts and skills:** Agent-facing prompt text lives in `**skills/*/SKILL.md`** files (YAML frontmatter plus body). The designer system prompt is `**prompts/designer-agentic-system/PROMPT.md`**. Resolution and composition from disk are centralized in **[server/lib/prompt-resolution.ts](server/lib/prompt-resolution.ts)**; structural placeholder glue with template variables is in **[server/lib/prompt-templates.ts](server/lib/prompt-templates.ts)**. Incubation, inputs-gen, design-system extraction, and evaluation run through the Pi agentic pipeline with session-scoped skill catalogs.

**Version store (committed):** Skills and `PROMPT.md` keep timestamped copies under **`skills/<key>/_versions/`** and **`prompts/designer-agentic-system/_versions/`**; rubric snapshots stay under **`.prompt-versions/snapshots/`**; **`.prompt-versions/manifest.jsonl`** logs everything. Meta-harness **proposer** / **promotion** still use **`snapshotBeforeWrite`** (**[meta-harness/version-store.ts](meta-harness/version-store.ts)**). **Manual workflow:** **`pnpm snap`** (no args) saves only files that changed since the last snapshot; pre-commit runs the same unless **`SKIP_SNAP=1`**. Details: **[USER_GUIDE.md § Version history](USER_GUIDE.md#version-history)**; harness-only: **[meta-harness/VERSIONING.md](meta-harness/VERSIONING.md)**.

### Two-process dev setup

The frontend (Vite, port **5173** only — `strictPort`) proxies `/api/*` to the API server (Hono/Node.js, port 3001). **Both must run together in development.** Prefer `pnpm dev:all` so Vite starts only after `/api/health` responds; otherwise the UI's first `/api/*` calls may get `ECONNREFUSED` until the API is up (hard refresh fixes it). A different Vite port would be a **different browser origin** — saved canvas library / active spec localStorage would not carry over; free **5173** with `pnpm dev:kill` if Vite fails to bind. Avoid `pnpm dev:server & pnpm dev` unless you manage the background job: `**Ctrl+C` may not stop the background API**, leaving port **3001** in use (`EADDRINUSE` on the next start). Free it with `lsof -nP -iTCP:3001 -sTCP:LISTEN` / `kill`, or `jobs` → `fg` → `Ctrl+C`. API keys live on the server only — never exposed to the browser.

**Provider concurrency:** OpenRouter runs hypothesis lanes in parallel; LM Studio runs sequentially (returns 500 on concurrent requests).

### Production / Vercel / shared deployments

- `**NODE_ENV=production`:** `GET`/`POST`/`DELETE` `**/api/logs`** return **404** (no shared in-memory LLM/trace ring).
- **CORS:** Optional `**ALLOWED_ORIGINS`** (comma-separated) in [server/env.ts](server/env.ts); when unset, only localhost dev origins. Set on Vercel when using a custom domain or preview URL that is not same-origin as `/api`.
- **Limits:** Request bodies capped at **2MB** (`hono/body-limit` on the API app). Preview map: `**MAX_PREVIEW_SESSIONS`** (default 200), `**MAX_PREVIEW_PAYLOAD_BYTES`** (default 5MB). Agentic: `**MAX_CONCURRENT_AGENTIC_RUNS**` per instance (default 5) → **503**-style error event on overload. `**LLM_LOG_MAX_BODY_CHARS`** defaults to **2000** in production for the NDJSON sink when unset.
- **Vercel Pro:** `api/[[...route]].ts` sets `**maxDuration = 800`** for long agentic streams.

## Critical gotchas

**Zustand v5 selectors** — `useSyncExternalStore` causes infinite re-renders if selectors return new arrays/objects. Never use `.filter()`, `.map()`, or derived collections directly in selectors. Subscribe to stable primitives and derive via `useMemo`. Zustand v5 removed the `equalityFn` second argument.

**React Flow inside nodes** — Use `onPointerDown` (not `onMouseDown`) for interactive elements inside nodes; React Flow intercepts `mousedown` before it reaches children. Add `nodrag nowheel` CSS classes to any interactive element inside a node to prevent React Flow from capturing those events.

**React 19 strict mode** — `useRef()` requires an explicit initial value: `useRef<T>(undefined)` or `useRef<T | null>(null)`.

**TypeScript strict** — Unused imports and variables fail the build.

### SSE pipeline diagnostics (dev)

In development, every agentic generation stream writes structured `console.debug` entries across the pipeline:

- **Server:** `[bridge]` for event-bridge errors/unhandled types; `[write-gate]` for SSE write failures; `[generate:SSE]` write-count summary at stream close.
- **Client:** `SseStreamDiagnostics` (`src/lib/sse-diagnostics.ts`) counts events and drops — inspect via `window.__SSE_DIAG`; `[stream:<id>]` per-callback logs in `placeholder-stream-handlers.ts`; `[raf:<id>]` batcher stats at finalize.

All diagnostics are tree-shaken in production or gated behind `import.meta.env.DEV` / `env.isDev`.

### Errors and optional telemetry

User-visible failures should use `[normalizeError](src/lib/error-utils.ts)` (and related helpers) so messages stay consistent. Optional debug POSTs to a local ingest URL must go through `[debugAgentIngest](server/lib/debug-agent-ingest.ts)` (server: `DEBUG_AGENT_INGEST=1`) or `[src/lib/debug-agent-ingest.ts](src/lib/debug-agent-ingest.ts)` (browser: dev + `VITE_DEBUG_AGENT_INGEST=1`) — they no-op by default. Avoid bare `.catch(() => {})` on real work; swallowing is only acceptable inside that guarded ingest or similarly optional side channels.

**Experiment forking** — Changing provider/model/format on a HypothesisNode and clicking Generate pins old previews (`data.pinnedRunId`), disconnects them, shifts them 200px down, and creates new preview nodes. Pinned previews use scoped IndexedDB lookups keyed by `${sId}:${runId}`.