# [AGENTS.md](http://AGENTS.md)

**Canonical instructions for AI coding agents** working in this repository—commands, where to read architecture (including Pi/just-bash sandbox), and gotchas. Follows the vendor-neutral [AGENTS.md](https://agents.md) convention (Cursor, Codex, Windsurf, and similar tools commonly load this filename).

**Claude Code** still discovers `**CLAUDE.md`** at the repo root first; that file is a **stub** pointing here.

## Session continuity

**There is no persistent memory across assistant sessions**—only files and git history. On each new thread, read this file, **[PRODUCT.md](PRODUCT.md)** for product intent, and **[ARCHITECTURE.md](ARCHITECTURE.md)** for implementation depth. Use recent git history for handoff context when needed.

## North Star

Read [PRODUCT.md § North Star](PRODUCT.md#north-star) before making any design or architecture decision. If a change does not serve that ambition, question whether it belongs.

## Release metadata

**Patch** (`x.y.Z` last segment): auto-incremented on every local `**git commit`** by Husky (`.husky/pre-commit` → `scripts/bump-patch-version.ts`, logic in `src/lib/semver-bump-patch.ts`). **Major and minor** (`x.y`) change only when you edit `**version`** in root `**package.json`** manually (e.g. `0.4.0`); the next commit then bumps patch to `0.4.1`. Skip the bump for a one-off commit: `SKIP_PATCH_BUMP=1 git commit ...`. CI (`CI=true`) never runs the bump.

The header's **date/time** comes from `**git log -1 --format=%cI`** (committer time of `HEAD`) when Vite loads — no manual timestamp. If you ship a tree **without** `.git`, set optional `**releasedAt`** in `package.json` (ISO-8601) for a fixed timestamp; otherwise `vite.config.ts` falls back to the build time. Display is always **America/New_York** (EST/EDT) in the UI.

**Version and timestamp in the header are baked in when Vite starts** (`vite.config.ts` `define`). After you change `package.json` or make a new `git commit`, **restart `pnpm dev`** / `**pnpm dev:all**` (or run `pnpm build` / `pnpm preview`) so the canvas header shows the updated `v…` and Eastern time — a running dev server does not pick up new values on its own.

`**git commit --amend**` runs the hook again and bumps patch again; avoid amending often or use `SKIP_PATCH_BUMP=1` if the version was already correct for that commit.

## Commands

```bash
# Development (API + Vite — avoids proxy ECONNREFUSED race)
pnpm dev:all         # API first, then Vite after http://127.0.0.1:${PORT:-4731}/api/health
pnpm dev:kill        # Free default API (4731) and Vite (4732) ports — uses PORT / VITE_PORT when set
# Or two terminals: pnpm dev:server  and  pnpm dev
pnpm dev             # Vite frontend at http://localhost:${VITE_PORT:-4732} (strict port — localStorage origin)
pnpm dev:server      # Hono API server at http://localhost:${PORT:-4731}

# Build & lint
pnpm build           # tokens:build, tsc -b, then vite build
pnpm lint            # eslint

# Tests
pnpm test            # root Vitest suite + design-system and Pi package tests
pnpm test:watch      # vitest (watch mode)
pnpm vitest run src/hooks/__tests__/resolve-evaluator-settings.test.ts  # single test file

# Experiments tool — prompt and flow iteration outside the canvas
pnpm exp run <flow> --brief <path>   # flows: ideation (default) | canonical | reframe-then-ideate | inputs-gen
pnpm exp list / show / diff          # browse runs
pnpm exp run --help                  # full flag list (sourcing, regen, target, caps, dry-run)
```

Vitest excludes both browser-evaluation test files (`browser-playwright-evaluator.test.ts` for merge logic, `browser-playwright-real.test.ts` for the real-browser path) via `vite.config.ts` so the default suite stays hermetic. Run **`pnpm test:playwright-eval`** (or `vitest run -c vitest.playwright.config.ts …`) when changing Playwright merge or scoring logic — it needs Chromium (`pnpm exec playwright install chromium`), and without it the real-browser assertions skip themselves.

**Verification reminder:** the root `pnpm test` runs the root Vitest suite plus the `@auto-designer/design-system` and `@auto-designer/pi` package tests. For a narrower package-only check, use `pnpm -F @auto-designer/pi test`.

## Architecture (quick reference)

**Full technical reference:** [ARCHITECTURE.md](ARCHITECTURE.md) — routes, server modules, client stores, canvas, generation (agentic Pi sandbox + optional auto-improve loop), preview URLs, Pi package boundary. **Pi design sandbox** (the `@auto-designer/pi` package: virtual filesystem, tool inventory, edit cascade, designer extension): [ARCHITECTURE.md § Pi design sandbox](ARCHITECTURE.md#pi-design-sandbox).

**Runtime flow and prompts:** Treat [RUNTIME_FLOW.md](RUNTIME_FLOW.md) as the canonical runtime flow, prompt/skill inventory, and exploration-axis model reference. Implementation mechanics remain in [ARCHITECTURE.md](ARCHITECTURE.md); editing workflow and snapshots are in [USER_GUIDE.md § Prompts and skills](USER_GUIDE.md#prompts-and-skills-editing-the-repo).

**Upgrading `@mariozechner/pi-coding-agent`.** Follow [ARCHITECTURE.md § Pi design sandbox](ARCHITECTURE.md#pi-design-sandbox) for the tool-surface contract. After bumping the dependency, run `pnpm -F @auto-designer/pi test`; the package tests catch upstream tool-surface drift.

**Version snapshots:** Follow **[USER_GUIDE.md § Version history](USER_GUIDE.md#version-history)**.

**Experiments tool:** [`experiments/`](experiments/README.md) is an in-repo CLI for iterating on prompts and flow shapes outside the canvas. Imports the same provider, prompt-resolution, Pi runtime, and evaluator modules the routes use; writes structured run directories that both an agent and a human can navigate. Use it for cheap iteration on prompt content or flow variants without UI coupling. Surface and matrix: [`experiments/README.md`](experiments/README.md); critique calibration heuristics: [`experiments/critique-guide.md`](experiments/critique-guide.md); chronological log of prompt-edit cycles and outcomes: [`experiments/iteration-log.md`](experiments/iteration-log.md). **A future-session agent picking up this work cold should read all three** — README for surface, critique-guide for judgment, iteration-log for what we changed and why.

### Two-process dev setup

The frontend (Vite, default port **4732** — `strictPort`; override **`VITE_PORT`**) proxies `/api/*` to the API server (Hono/Node.js, default **`PORT`** **4731**). **Both must run together in development.** Prefer `pnpm dev:all` so Vite starts only after `/api/health` responds; otherwise the UI's first `/api/*` calls may get `ECONNREFUSED` until the API is up (hard refresh fixes it). A different Vite port is a **different browser origin** — saved canvas library and active workspace browser storage would not carry over; free the port with `pnpm dev:kill` if Vite fails to bind. Avoid `pnpm dev:server & pnpm dev` unless you manage the background job: `**Ctrl+C` may not stop the background API**, leaving **`PORT`** in use (`EADDRINUSE` on the next start). Free it with `lsof -nP -iTCP:$PORT -sTCP:LISTEN` / `kill`, or `jobs` → `fg` → `Ctrl+C`. Defaults live in **`server/dev-defaults.ts`** (keep shell fallbacks in `package.json` / `scripts/kill-dev-servers.sh` aligned). API keys live on the server only — never exposed to the browser.

**Provider concurrency:** OpenRouter runs hypothesis lanes in parallel; LM Studio runs sequentially (returns 500 on concurrent requests).

### Production / Vercel / shared deployments

- `**NODE_ENV=production`:** `GET`/`POST`/`DELETE` `**/api/logs`** return **404** (no shared in-memory LLM/trace/task ring).
- **CORS:** Optional `**ALLOWED_ORIGINS`** (comma-separated) in [server/env.ts](server/env.ts); when unset, only localhost dev origins. Set on Vercel when using a custom domain or preview URL that is not same-origin as `/api`.
- **Limits:** Request bodies capped at **2MB** (`hono/body-limit` on the API app). Preview map: `**MAX_PREVIEW_SESSIONS`** (default 200), `**MAX_PREVIEW_PAYLOAD_BYTES`** (default 5MB). Agentic: `**MAX_CONCURRENT_AGENTIC_RUNS**` per instance (default 5) → **503**-style error event on overload. `**LLM_LOG_MAX_BODY_CHARS`** defaults to **2000** in production for the NDJSON sink when unset.
- **Vercel Pro:** `api/[[...route]].js` sets `**maxDuration = 800`** for long agentic streams.

## Critical gotchas

**Zustand v5 selectors** — `useSyncExternalStore` causes infinite re-renders if selectors return new arrays/objects. Never use `.filter()`, `.map()`, or derived collections directly in selectors. Subscribe to stable primitives and derive via `useMemo`. Zustand v5 removed the `equalityFn` second argument.

**React Flow inside nodes** — Use `onPointerDown` (not `onMouseDown`) for interactive elements inside nodes; React Flow intercepts `mousedown` before it reaches children. Add `nodrag nowheel` CSS classes to any interactive element inside a node to prevent React Flow from capturing those events.

**React 19 strict mode** — `useRef()` requires an explicit initial value: `useRef<T>(undefined)` or `useRef<T | null>(null)`.

**TypeScript strict** — Unused imports and variables fail the build.

### SSE pipeline diagnostics (dev)

In development, every agentic generation stream writes structured `console.debug` entries across the pipeline:

- **Server:** `[bridge]` for event-bridge errors/unhandled types; `[write-gate]` for SSE write failures; `[generate:SSE]` write-count summary at stream close; `(task:SSE)` write summary for **task routes** (`incubate`, `inputs-generate`, `design-system` — see `server/lib/sse-task-route.ts`).
- **Agentic abort correlation (dev):** grep around the run’s `correlationId` (request body / LLM logs) for `[agentic-orchestrator] onStream failed` (SSE delivery → delivery abort), `[agentic-orchestrator] build phase: effectiveSignal aborted after Pi session` (includes `upstreamAbort` vs `deliveryAbort`), `[generate:SSE]`, and `[write-gate]`. If `onStream failed` is absent but the client disconnected, expect upstream abort only.
- **Client:** `SseStreamDiagnostics` (`src/lib/sse-diagnostics.ts`) counts events and drops — inspect via `window.__SSE_DIAG`; `(stream:<id>)` per-callback logs in `placeholder-stream-handlers.ts`; `(raf:<id>)` batcher stats at finalize. (Prefixes use parentheses so Tailwind’s scanner does not treat them as arbitrary class names.)

All diagnostics are tree-shaken in production or gated behind `import.meta.env.DEV` / `env.isDev`.

### Errors and optional telemetry

User-visible failures should use `[normalizeError](src/lib/error-utils.ts)` (and related helpers) so messages stay consistent. Optional debug POSTs to a local ingest URL must go through `[debugAgentIngest](server/lib/debug-agent-ingest.ts)` (server: `DEBUG_AGENT_INGEST=1`) or `[src/lib/debug-agent-ingest.ts](src/lib/debug-agent-ingest.ts)` (browser: dev + `VITE_DEBUG_AGENT_INGEST=1`) — they no-op by default. Avoid bare `.catch(() => {})` on real work; swallowing is only acceptable inside that guarded ingest or similarly optional side channels.

**LogRocket session replay (client-only, optional in dev / default-on in prod):** [`src/lib/logrocket-bootstrap.ts`](src/lib/logrocket-bootstrap.ts) runs `LogRocket.init` once from [`src/main.tsx`](src/main.tsx) before the app mounts. App id resolution is `VITE_LOGROCKET_APP_ID` → production default `qbwhsc/designer-6dify` → off; dev builds with no env var stay off. `release` comes from `VITE_APP_VERSION` (the same value the canvas header shows). [`LogRocketRouteTracker`](src/components/shared/LogRocketRouteTracker.tsx) emits `spa-navigation` `LogRocket.track` events on every router location change; [`ErrorBoundary`](src/components/shared/ErrorBoundary.tsx) calls `LogRocket.captureException` with the React component stack. Both gate on `isLogRocketActive()` so they no-op when the SDK didn't initialize. **No user identification** is wired up yet — sessions are anonymous. **No DOM/network sanitization** is configured; review [LogRocket DOM redaction](https://docs.logrocket.com/reference/dom) before any production data starts flowing through it.

**Experiment forking** — Changing provider/model/format on a HypothesisNode and clicking Generate pins old previews (`data.pinnedRunId`), disconnects them, shifts them 200px down, and creates new preview nodes. Pinned previews use scoped IndexedDB lookups keyed by `${sId}:${runId}`.
