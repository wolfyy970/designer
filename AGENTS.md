# AGENTS.md

**Canonical instructions for AI coding agents** working in this repository—commands, where to read architecture (including Pi/just-bash sandbox), Langfuse prompt workflow, and gotchas. Follows the vendor-neutral [AGENTS.md](https://agents.md) convention (Cursor, Codex, Windsurf, and similar tools commonly load this filename).

**Claude Code** still discovers `**CLAUDE.md`** at the repo root first; that file is a **stub** pointing here. **Do not confuse** this document with Langfuse `**agents-md-file`**: that prompt is seeded as a **virtual** `AGENTS.md` under `/home/user/project` inside the **Pi design sandbox** only (output rules for generated artifacts), not this developer-facing file.

## North Star

Read [PRODUCT.md § North Star](PRODUCT.md#north-star) before making any design or architecture decision. If a change does not serve that ambition, question whether it belongs.

## Release metadata

**Patch** (`x.y.Z` last segment): auto-incremented on every local `**git commit`** by Husky (`.husky/pre-commit` → `scripts/bump-patch-version.ts`, logic in `src/lib/semver-bump-patch.ts`). **Major and minor** (`x.y`) change only when you edit `**version`** in root `**package.json`** manually (e.g. `0.4.0`); the next commit then bumps patch to `0.4.1`. Skip the bump for a one-off commit: `SKIP_PATCH_BUMP=1 git commit ...`. CI (`CI=true`) never runs the bump.

The header’s **date/time** comes from `**git log -1 --format=%cI`** (committer time of `HEAD`) when Vite loads — no manual timestamp. If you ship a tree **without** `.git`, set optional `**releasedAt`** in `package.json` (ISO-8601); `vite.config.ts` falls back to it. Display is always **America/New_York** (EST/EDT) in the UI.

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

### Two-process dev setup

The frontend (Vite, port **5173** only — `strictPort`) proxies `/api/*` to the API server (Hono/Node.js, port 3001). **Both must run together in development.** Prefer `pnpm dev:all` so Vite starts only after `/api/health` responds; otherwise the UI’s first `/api/*` calls may get `ECONNREFUSED` until the API is up (hard refresh fixes it). A different Vite port would be a **different browser origin** — saved canvas library / active spec localStorage would not carry over; free **5173** with `pnpm dev:kill` if Vite fails to bind. Avoid `pnpm dev:server & pnpm dev` unless you manage the background job: `**Ctrl+C` may not stop the background API**, leaving port **3001** in use (`EADDRINUSE` on the next start). Free it with `lsof -nP -iTCP:3001 -sTCP:LISTEN` / `kill`, or `jobs` → `fg` → `Ctrl+C`. API keys live on the server only — never exposed to the browser.

**Provider concurrency:** OpenRouter runs hypothesis lanes in parallel; LM Studio runs sequentially (returns 500 on concurrent requests).

### Production / Vercel / shared deployments

- **`NODE_ENV=production`:** `GET`/`POST`/`DELETE` **`/api/logs`** return **404** (no shared in-memory LLM/trace ring). **`PUT /api/prompts/:key`** and **`POST …/revert-baseline`** return **404**; use Langfuse (or run admin CLI against a **dev** API) to promote prompt versions. Observability → **Run trace** tab explains the disabled ring in the UI.
- **CORS:** Optional **`ALLOWED_ORIGINS`** (comma-separated) in [server/env.ts](server/env.ts); when unset, only localhost dev origins. Set on Vercel when using a custom domain or preview URL that is not same-origin as `/api`.
- **Limits:** Request bodies capped at **2MB** (`hono/body-limit` on the API app). Preview map: **`MAX_PREVIEW_SESSIONS`** (default 200), **`MAX_PREVIEW_PAYLOAD_BYTES`** (default 5MB). Agentic: **`MAX_CONCURRENT_AGENTIC_RUNS`** per instance (default 5) → **503**-style error event on overload. **`LLM_LOG_MAX_BODY_CHARS`** defaults to **2000** in production for the NDJSON sink when unset.
- **Vercel Pro:** `api/[[...route]].ts` sets **`maxDuration = 800`** for long agentic streams.

## Mandatory: prompt edits must sync to Langfuse

`**src/lib/prompts/shared-defaults.ts`** is the repo source of truth for prompt bodies. Langfuse is the **runtime** source of truth — when configured, the server reads prompts from Langfuse, **not** from `shared-defaults.ts`. The defaults are only used when Langfuse is not configured.

**Every time you edit a prompt body in `shared-defaults.ts`, you MUST immediately run `pnpm langfuse:sync-prompts`** so Langfuse gets the new text. Sync uses `**prompt.create**`: it **adds a new prompt version** and moves `**LANGFUSE_PROMPT_LABEL`** (default `production`) to it — **previous versions remain** in Langfuse for history/diffs (not an in-place overwrite). If you skip sync, the edit is dead code in any Langfuse-enabled environment. There is no "do it later" — sync is part of the edit, not a follow-up.

```bash
# REQUIRED after any change to shared-defaults.ts prompt bodies:
pnpm langfuse:sync-prompts
```

Do not treat `shared-defaults.ts` as a standalone file you can edit in isolation. Editing a prompt means: change the body in `shared-defaults.ts` → run `langfuse:sync-prompts` → verify the sync log shows **new Langfuse prompt version** lines for changed keys.

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