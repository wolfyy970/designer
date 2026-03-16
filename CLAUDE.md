# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (requires two terminals)
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
The frontend (Vite, port 5173) proxies `/api/*` to the API server (Hono/Node.js, port 3001). **Both must run together in development.** API keys live on the server only — never exposed to the browser.

### Server (`server/`)
Hono app with five route groups:
- `POST /api/compile` — runs spec sections through LLM to produce variant prompts (SSE)
- `POST /api/generate` — generates HTML/React code from a prompt (SSE)
- `GET /api/models` — lists available models from a provider
- `GET/POST /api/design-system` — vision-extracts design tokens from images
- `GET /api/logs` — returns recent LLM call logs (dev debugging)

Provider implementations are in `server/services/providers/` (OpenRouter + LM Studio). Both implement `generateChat()` and `listModels()`. **LM Studio runs on a remote machine at `192.168.252.213:1234`, not localhost.**

### Frontend (`src/`)
A single-page app with one route: `/canvas`. Everything else redirects there.

**State management** — Zustand stores with `persist` middleware:
- `canvas-store` — nodes, edges, viewport, layout settings (persist v13)
- `generation-store` — result metadata only; code is in IndexedDB (persist v2)
- `spec-store` — 8-section spec document
- `compiler-store` — compiled variant prompts
- `prompt-store` — user-overridable system/user prompt text

**Heavy data in IndexedDB** — generated code + provenance snapshots are stored via `idb-keyval` (`src/services/idb-storage.ts`), not localStorage. The generation store only persists metadata; code is stripped via `partialize`. GC runs 3s after App mount.

### Canvas node-graph
Uses `@xyflow/react` v12. The canvas has 11 node types in a 4-column layout:
1. **Section nodes** (col 0) — `designBrief`, `existingDesign`, `researchContext`, `objectivesMetrics`, `designConstraints` — all rendered by the shared `SectionNode.tsx` component
2. **Processing nodes** (col 1–2) — `compiler` (labeled "Incubator"), `designSystem`, `model`
3. **Hypothesis nodes** (col 2) — strategy + format + Generate button; reads provider/model from connected ModelNode
4. **Variant nodes** (col 3) — sandboxed iframe previews of generated code; accumulate across runs (version stacking)
5. **Critique node** — feedback input for iterating on variants

**Model config** flows via edges: `ModelNode → CompilerNode | HypothesisNode | DesignSystemNode`. The `useConnectedModel(nodeId)` hook traverses edges to read provider/model. There is no inline provider/model on processing nodes.

**Canvas migrations** (`src/stores/canvas-migrations.ts`) run on every hydration via Zustand's `migrate` option. Current version: 13. Any schema change to canvas node data requires a new migration function.

### Generation flow
1. User clicks Generate on a HypothesisNode
2. `useGenerate()` hook POSTs to `/api/generate` (SSE)
3. Server calls provider's `generateChat()`, extracts code via `extractCode()`
4. Code streams back as SSE events; stored in IndexedDB via `saveCode()`
5. Variant node reads code via `useResultCode()` async hook and renders in sandboxed iframe
6. OpenRouter runs variants in parallel; LM Studio runs sequentially (returns 500 on concurrent requests)

### Iframe rendering
Generated code renders in `sandbox="allow-scripts"` iframes. `wrapReactCode()` in `src/lib/iframe-utils.ts` prepares React components for browser Babel — it **must** strip `export default` and `import` statements because Babel standalone converts them to CommonJS but `exports` doesn't exist in a plain browser iframe.

## Critical gotchas

**Zustand v5 selectors** — `useSyncExternalStore` causes infinite re-renders if selectors return new arrays/objects. Never use `.filter()`, `.map()`, or derived collections directly in selectors. Subscribe to stable primitives and derive via `useMemo`. Zustand v5 removed the `equalityFn` second argument.

**React Flow inside nodes** — Use `onPointerDown` (not `onMouseDown`) for interactive elements inside nodes; React Flow intercepts `mousedown` before it reaches children. Add `nodrag nowheel` CSS classes to any interactive element inside a node to prevent React Flow from capturing those events.

**React 19 strict mode** — `useRef()` requires an explicit initial value: `useRef<T>(undefined)` or `useRef<T | null>(null)`.

**TypeScript strict** — Unused imports and variables fail the build.

**Experiment forking** — Changing provider/model/format on a HypothesisNode and clicking Generate pins old variants (`data.pinnedRunId`), disconnects them, shifts them 200px down, and creates new variant nodes. Pinned variants use scoped IndexedDB lookups keyed by `${vsId}:${runId}`.
