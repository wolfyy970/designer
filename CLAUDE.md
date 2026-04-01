# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (API + Vite — avoids proxy ECONNREFUSED race)
pnpm dev:all         # API first, then Vite after http://localhost:3001/api/health
pnpm dev:kill        # Free ports 3001 and 5173 (stuck dev servers)
# Or two terminals: pnpm dev:server  and  pnpm dev
pnpm dev             # Vite frontend at http://localhost:5173
pnpm dev:server      # Hono API server at http://localhost:3001

# Build & lint
pnpm build           # tsc -b && vite build
pnpm lint            # eslint

# Tests
pnpm test            # vitest run (one-shot)
pnpm test:watch      # vitest (watch mode)
pnpm vitest run src/lib/__tests__/extract-code.test.ts  # single test file
```

## Architecture

### Two-process dev setup
The frontend (Vite, port 5173) proxies `/api/*` to the API server (Hono/Node.js, port 3001). **Both must run together in development.** Prefer `pnpm dev:all` so Vite starts only after `/api/health` responds; otherwise the UI’s first `/api/*` calls may get `ECONNREFUSED` until the API is up (hard refresh fixes it). Avoid `pnpm dev:server & pnpm dev` unless you manage the background job: **`Ctrl+C` may not stop the background API**, leaving port **3001** in use (`EADDRINUSE` on the next start). Free it with `lsof -nP -iTCP:3001 -sTCP:LISTEN` / `kill`, or `jobs` → `fg` → `Ctrl+C`. API keys live on the server only — never exposed to the browser.

### Server (`server/`)
Hono app under `/api`: compile, generate (SSE), models, design-system extract, prompts and skills (Prisma-backed GET), logs (dev). See [ARCHITECTURE.md](ARCHITECTURE.md) for the route table.

Provider implementations are in `server/services/providers/` (OpenRouter + LM Studio). Both implement `generateChat()` and `listModels()`. **LM Studio runs on a remote machine at `192.168.252.213:1234`, not localhost.**

### Frontend (`src/`)
A single-page app with one route: `/canvas`. Everything else redirects there.

**State management** — Zustand stores with `persist` middleware:
- `workspace-domain-store` — canonical workflow relations (incubator wiring, hypotheses, model assignments, variant slots, mirrored DS/model/critique payloads)
- `canvas-store` — React Flow nodes, edges, viewport, layout (persist v13); kept in sync with domain via `workspace/domain-commands.ts`
- `generation-store` — result metadata only; code is in IndexedDB (persist v2)
- `spec-store` — 8-section spec document
- `compiler-store` — `DimensionMap` per incubator id + compiled prompts
- `prompt-store` — user-overridable system/user prompt text

**Heavy data in IndexedDB** — generated code + provenance snapshots are stored via `idb-keyval` (`src/services/idb-storage.ts`), not localStorage. The generation store only persists metadata; code is stripped via `partialize`. GC runs 3s after App mount.

### Canvas node-graph
Uses `@xyflow/react` v12. The canvas has 11 node types in a 4-column layout:
1. **Section nodes** (col 0) — `designBrief`, `existingDesign`, `researchContext`, `objectivesMetrics`, `designConstraints` — all rendered by the shared `SectionNode.tsx` component
2. **Processing nodes** (col 1–2) — `compiler` (labeled "Incubator"), `designSystem`, `model`
3. **Hypothesis nodes** (col 2) — strategy + format + **Generate** / **Run agent**; Mode **Direct** vs **Agentic**; reads provider/model from connected ModelNode
4. **Variant nodes** (col 3) — sandboxed iframe previews of generated code; accumulate across runs (version stacking)
5. **Critique node** — feedback input for iterating on variants

**Model config** — Domain store records models per incubator and per hypothesis; `useConnectedModel(nodeId)` prefers that, then incoming model edges. There is no inline provider/model on processing nodes.

**Canvas migrations** (`src/stores/canvas-migrations.ts`) run on every hydration via Zustand's `migrate` option. Current version: 13. Any schema change to canvas node data requires a new migration function.

### Generation flow
**Single-shot:** User clicks Generate → `useGenerate()` POSTs `/api/generate` (SSE) → server `generateChat` + `extractCode()` → streamed code → IndexedDB → variant iframe.

**Agentic:** Same entrypoint with `mode: 'agentic'` → `runAgenticWithEvaluation` runs a PI tool loop (`server/services/pi-agent-service.ts`), then parallel evaluator workers (`design-evaluation-service.ts`): LLM rubrics (design/strategy/implementation) + browser preflight (`browser-qa-evaluator.ts`), merged with optional Playwright (`browser-playwright-evaluator.ts`) when `BROWSER_PLAYWRIGHT_EVAL` is on and Chromium is installed. Bounded revision rounds re-seed the agent with eval feedback. Versioned **skills** load from Prisma into a virtual `skills/` tree and extend the agentic system prompt (`generate.ts`, `db/skills.ts`, `lib/skills/*`).

**Multi-file persistence:** Agentic file maps go to IndexedDB via `saveFiles()`; provenance can include evaluation rounds + checkpoint.

**Provider concurrency:** OpenRouter runs variants in parallel; LM Studio runs sequentially (returns 500 on concurrent requests).

### Iframe rendering
Generated code renders in `sandbox="allow-scripts"` iframes. `wrapReactCode()` in `src/lib/iframe-utils.ts` prepares React components for browser Babel — it **must** strip `export default` and `import` statements because Babel standalone converts them to CommonJS but `exports` doesn't exist in a plain browser iframe.

## Critical gotchas

**Zustand v5 selectors** — `useSyncExternalStore` causes infinite re-renders if selectors return new arrays/objects. Never use `.filter()`, `.map()`, or derived collections directly in selectors. Subscribe to stable primitives and derive via `useMemo`. Zustand v5 removed the `equalityFn` second argument.

**React Flow inside nodes** — Use `onPointerDown` (not `onMouseDown`) for interactive elements inside nodes; React Flow intercepts `mousedown` before it reaches children. Add `nodrag nowheel` CSS classes to any interactive element inside a node to prevent React Flow from capturing those events.

**React 19 strict mode** — `useRef()` requires an explicit initial value: `useRef<T>(undefined)` or `useRef<T | null>(null)`.

**TypeScript strict** — Unused imports and variables fail the build.

**Experiment forking** — Changing provider/model/format on a HypothesisNode and clicking Generate pins old variants (`data.pinnedRunId`), disconnects them, shifts them 200px down, and creates new variant nodes. Pinned variants use scoped IndexedDB lookups keyed by `${vsId}:${runId}`.
