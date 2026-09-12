# SRP / SoC / Module-Boundary Audit — `designer`

Scope: `/Users/kcwolff/Developer/GitHub/designer` @ working tree (read-only; no source file modified).
Lens: Single Responsibility Principle, Separation of Concerns, module boundaries.
Docs read for intent: `ARCHITECTURE.md`, `AGENTS.md`, `PRODUCT.md`, `RUNTIME_FLOW.md`, `DOCUMENTATION.md`.

Governing contract quoted verbatim:

- `ARCHITECTURE.md:256` — "**Direct `../../src/...` imports are OK** for pure types, Zod schemas, and shared **constants** with no Node/browser coupling"
- `ARCHITECTURE.md:257` — "Orchestration and modules that need route-adjacent logging or workspace bundling live under **`server/services/`** … — `server/lib/` must not import upward into `server/services/`."
- `ARCHITECTURE.md:259` — "Do **not** import React, Vite-only code, or browser APIs from `server/`."
- `ARCHITECTURE.md:41` — "The server keeps routes thin and pushes orchestration into `generate-execution`, providers, and the agentic pipeline."
- `ARCHITECTURE.md:521` / `PRODUCT.md:108` — generated code lives in IndexedDB **via `StoragePort`** ("allows swapping to a server-backed database later without changing any consuming code").
- `ARCHITECTURE.md:500` — "The SPA sends workspace/spec payloads and model settings; prompt text is never client-editable."

Enforcement reality: `eslint.config.js:27-45` defines only `no-unused-vars` + `prefer-const` for `src/api`, `src/lib`, `server/services`, `packages/**`. **No `no-restricted-imports`, no boundary plugin, no dependency-cruiser exists.** `tsconfig.server.json:27-53` `include` is a root set, not a barrier — transitively imported files are pulled in regardless. Every boundary finding below is currently unenforceable by CI.

---

## Ranked findings

### 1. `VariantRunInspector` — six responsibilities in one 560-line component; zero direct tests — **EXTREME**

**Where:** `src/components/canvas/VariantRunInspector.tsx:54-560`

**Mixed responsibilities (measured, not inferred):**

| # | Responsibility | Lines |
|---|---|---|
| 1 | Graph-liveness guard — decide when the open panel must self-close, including two *distinct* stale-selection effects with a documented ordering hazard | `:67-86` (3 effects: `:72-80`, `:83-86`, `:88-95` for Esc) |
| 2 | Tab/session-local UI state reset on node change | `:97-103` |
| 3 | Preview-result resolution — `useVersionStack` + legacy `refId` fallback + strategy-name lookup | `:105-122` |
| 4 | Payload formatting — `prepareIframeContent` / `renderErrorHtml` inside `useMemo` | `:131-142` |
| 5 | **Persistence I/O** — `storage.loadRoundFiles()` with its own cancellation, error swallow, and 5-branch gating | `:159-188` (`storage` imported at `:7`) |
| 6 | Eval-round derivation + files-tab file selection + 5-way render gating | `:144-241`, `:401-465` |

Owns **7 `useEffect`, 5 `useState`, 4 `useMemo`, 4 store subscriptions, 1 direct `StoragePort` call, 2 custom data hooks** — the widest hook/effect surface in `src/`.

The eval-round "should I load round files, and are they still loading?" predicate is written out **four times** nearly verbatim, e.g. `:406-410`, `:415-417`, `:453-455`, `:504-506`, `:515-517`, `:527-529`. The `Eval round` `<select>` JSX is duplicated at `:382-400` and `:471-489`.

**Seam:**
- `useInspectorAutoClose(nodeId, nodes)` → `src/components/canvas/hooks/` — responsibilities 1+2. This closes the documented rehydration race (`:67-71`) in a unit test instead of by comment.
- `useEvalRoundFiles(result, rounds, selectedRound)` → `src/hooks/` — responsibility 5. This is the only I/O in the component and the only place the "latest round uses live files, older rounds come from IDB" rule lives.
- `resolveEvalRoundView(rounds, rawIdx)` → pure, in `src/lib/variant-run-view.ts` — responsibility 6's `safeRoundIdx` / `lastRoundNum` / `isLatestEvalRound` / `designPreviewFiles` chain (`:144-208`, ~65 lines).
- `useResultPayload(result)` — dedupes responsibility 4 (see finding 12).
- Extract `<EvalRoundSelect>` for the duplicated control; `<FilesTabPanel>` / `<DesignTabPanel>` collapse the six render gates into one `phase` value.

**Benefit:** the repo's single most complex function becomes a layout shell over 4 testable units. `runInspectorPreviewNodeId` is already exercised indirectly (`src/workspace/__tests__/canvas-mutation-planner.test.ts:105`, `src/stores/__tests__/canvas-remove-preview.test.ts:84`) — the panel itself is **not**: `src/components/canvas/__tests__/canvas-workspace.test.tsx:56` stubs it (`vi.mock('../VariantRunInspector', () => ({ default: () => null }))`), and no other test renders it. This finding is pure test-surface gain with no behavior change.

---

### 2. Three parallel byte-store paths, and `StoragePort` is not the one most modules use — **VERY HIGH**

**Where:** `src/storage/browser-storage.ts:4-22`, `src/services/idb-storage.ts:101-177`, `src/services/persistence.ts:35,63`, `src/components/canvas/OptionalInputsTip.tsx:26,36`, `src/services/canvas-snapshot-restore.ts:89`, `src/lib/canvas-graph.ts:4`

The documented model is `Model (stores) → StoragePort` (`ARCHITECTURE.md:54`, `:522`). Measured reality:

- `src/storage/browser-storage.ts:4-22` is a **pure pass-through** — every member is `idb.X` with zero added logic. It is a seam that exists only on paper.
- The real implementation (`src/services/idb-storage.ts`) is imported **directly by 9 non-test modules**, bypassing the port: `src/App.tsx:6`, `src/main.tsx:6`, `src/components/canvas/nodes/useVariantNodeDebugExport.ts:9`, `src/hooks/useResultCode.ts:3`, `src/hooks/useResultFiles.ts:3`, `src/lib/canvas-graph.ts:4`, `src/services/migration.ts:12`, `src/services/canvas-snapshot-artifacts.ts:12`, `src/services/persistence.ts:13`.
- Only **3 non-test modules** use the port: `src/stores/generation-store.ts:7`, `src/hooks/placeholder-finalize.ts:3`, `src/components/canvas/VariantRunInspector.tsx:7` — i.e. **a leaf `src/lib/` module (`canvas-graph.ts`) holds a raw IndexedDB handle** while the store layer is supposed to be the only writer.
- A **third** path exists for the same class of data: `src/services/persistence.ts:35,63` writes the canvas-snapshot index to `localStorage` directly, `src/services/canvas-snapshot-restore.ts:89` writes the spec-store persist blob directly (`localStorage.setItem(STORAGE_KEYS.ACTIVE_CANVAS, JSON.stringify({ state: { spec }, version: 1 }))`), and `src/components/canvas/OptionalInputsTip.tsx:26,36` does raw `localStorage.getItem/setItem` **inside a React component**, with its own `try/catch` that the `storage-keys.ts:44-62` flag helpers already provide.

**Seam:** (a) make `src/services/idb-storage.ts` own connection/env details and have `src/storage/browser-storage.ts` add the GC/metrics policy it is supposed to own, then rewrite the 9 direct importers to the port; (b) give `persistence.ts` a `CanvasLibraryPort` (metadata in localStorage, blobs in IDB) instead of open-coded `localStorage`; (c) move `OptionalInputsTip`'s read/write to `isStorageFlagSet` / `markStorageFlag` (`src/lib/storage-keys.ts:44-62`).

**Benefit:** `ARCHITECTURE.md:522`'s stated promise ("swapping to a server-backed database later without changing any consuming code") becomes true. Right now, changing the byte store requires edits in 9 unrelated modules plus one component.

---

### 3. Two cross-store migration ladders live in the wrong layer and read other stores' persisted blobs — **VERY HIGH**

**Where:** `src/stores/canvas-migrations.ts` (723 lines, 244 total complexity), `src/stores/workspace-domain-migrate.ts` (277 lines, cx 72)

- `src/stores/canvas-migrations.ts:7-16` + `:152-160` — `readLocalStorageJson(key)` / `readDesignSystemSection(storageKey)` read **another store's persist document** by key during migration (`:166`, `:199` read `STORAGE_KEYS.ACTIVE_CANVAS`, the spec store's key). `canvas-migrations.ts:69-71` does the same against `STORAGE_KEYS.GENERATION`. A schema change in `spec-store` or `generation-store` silently changes a canvas migration's result.
- The migration ladder is not a ladder: **7 independent Zustand persist versions** at different numbers — `canvas-store.ts:68` (v33), `workspace-domain-persist.ts:13` (v13), `task-config-store.ts:151` (v6), `generation-store.ts:358` (v5), `incubator-store.ts:285` (v3), `evaluator-defaults-store.ts:111` (v2), `spec-store.ts:37/176` (v1/v2) — with two separate hand-written ladders (`canvas-migrations.ts:660-704` for 31 steps, `workspace-domain-migrate.ts:36-242` for 12 steps) that encode mutual assumptions about each other.
- `src/stores/canvas-migrations.ts:712` re-applies `migrateV29ToV30 → migrateV30ToV31 → migrateV31ToV32 → migrateV32ToV33` **inside the normalizer**, after the ladder already ran them at `:698-701`. Idempotent today, so no behavior change — but it means the "current shape" definition is duplicated between `:698-701` and `:712`, and the next migration step added to one place and not the other silently diverges. This is pure defense-in-depth accretion; the seam is to delete the second application and fold whatever fallback is genuinely needed into the normalizer's field checks.
- Both files are 100% pure functions of `(persisted, fromVersion)` *except* for the three cross-store reads above — which is exactly why they cannot be tested without a fake `localStorage` (the 46 tests in `src/stores/__tests__/canvas-migrations.test.ts` are step-granular, not ladder-granular).

**Seam:** (a) invert the cross-store reads — the spec/generation recovery data becomes an **input argument** (`migrateCanvasState(state, fromVersion, { designSystemSection })`), supplied by `canvas-store.ts:69-79` at hydrate time; the migration becomes fully pure. (b) Introduce one `createMigrationLadder<TSource, TTarget>(steps)` runner in `src/lib/` and express all seven ladders as ordered step arrays, so "did I add a step and forget to register it?" is a type error instead of a review miss. (c) Delete the duplicate re-application at `:712`.

**Benefit:** migrations become the pure, unit-testable, ordering-checked layer the tests already pretend they are; a `spec-store` change can no longer alter canvas migration output.

---

### 4. `/api/incubate` and `/api/design-system/extract` routes own prompt bodies, domain schemas, and model-output quality gates — **HIGH**

**Where:** `server/routes/incubate.ts:28-238`, `server/routes/design-system.ts:12-96`

`inputs-generate.ts` is the correct shape: it delegates its user message to a pure builder at `server/routes/inputs-generate.ts:33-39` (`buildInputsGenerateUserMessage` in `src/lib/prompts/inputs-generate.ts`). The other two do not:

- `server/routes/incubate.ts:28-85` — 58 lines of **domain Zod schemas with LLM-repair coercions** defined in the route: `dimensionRangeSchema` (array→string), `measurementsSchema`, and `HypothesisStrategyParseSchema` which **mints domain ids** (`id: generateId()` at `:59`).
- `server/routes/incubate.ts:159-170` — the 10-line `<task>` scaffolding literal, including an **embedded copy of the result JSON schema** (`:163-166`) that must be kept in sync with the Zod schema 90 lines above it. `RUNTIME_FLOW.md:117` documents this as living in `hypotheses-generator-system` guidance; the file is loaded at `:159` but the task body is hand-written here.
- `server/routes/incubate.ts:198-219` — the two product-quality gates (`incubationLooksLikeTemplateEcho`, `incubationFirstHypothesisEmpty`) that decide whether a run is a failure, thrown as user-facing strings from inside the SSE `onTaskResult` callback.
- `server/routes/incubate.ts:97-129` — `applyBrainstormPrelude` runs an LLM prelude and **mutates `body.spec.sections['design-brief']` in place** (`:112-117`), then converts a throw into an HTTP response (`:119-128`). `ARCHITECTURE.md:41` assigns this to `services/`.
- `server/routes/design-system.ts:41-73` — a **33-line literal prompt template** in the route. `RUNTIME_FLOW.md:127` documents this as a known gap and names the intended home: the bundled `ds-extract-input.md` user-message prompt, which is **already registered** at `server/lib/prompt-resolution.ts:29` but never called. `design-system.ts:12-17` also defines a generic XML-escaping helper in a route file.

**Seam:** `incubate.ts:28-85` → `server/lib/incubation-plan-schema.ts` (pure, testable today). `incubate.ts:180-238` → `server/services/incubate-plan.ts` exporting `parseIncubationPlanResult` with the two gates as named exported predicates. `incubate.ts:97-149` → `server/services/incubator-brainstorm.ts` (which already exists; see finding 11). `design-system.ts:12-73` → `server/services/design-system-prompt.ts`, resolving the already-registered prompt key.

**Benefit:** `server/routes/__tests__/incubate-route.test.ts` is 322 lines — the second-largest server test file — because the only way to test the parse/gate chain is through HTTP plus a mocked task runner. Extracting the chain makes it a table test. Prompt authority returns to `packages/auto-designer-pi/prompts/` per `ARCHITECTURE.md:500`, so tuning the DESIGN.md prompt stops being a code change.

---

### 5. `runPiAgentSession` fuses watchdog, bridge, logging, and error translation — and can emit `error` twice — **HIGH**

**Where:** `server/services/pi-agent-runtime.ts:242-422`

`ARCHITECTURE.md:289` claims this module is "composed from three pure helpers". Verified: `resolveProviderConfig` (`:117-137`), `dispatchSessionFactory` (`:143-161`) and `mapPackageResult` (`:172-193`) **do exist and are genuinely separable**. But the entry function adds six more concerns the doc does not acknowledge:

| Concern | Lines |
|---|---|
| Stream-idle watchdog: 240 s constant, interval poll, `abort()`, `watchdogReject`, `Promise.race` | `:99-102`, `:343-376`, `:381`, `:401` |
| `StreamIdleError` taxonomy | `:54-67`, `:374`, `:396-398` |
| Session-config/callback assembly (`onFile`/`onTodos`/`onPackageEvent`, `baseOpts`) | `:256`, `:258-295` |
| Resource-loader construction | `:197-220`, `:289-294` |
| LLM-log wiring + finalizer drain | `:303-314`, `:404-409` |
| Bridge subscription + error translation + dev logging | `:316-341`, `:365-372`, `:382-395` |

**Four separate `error` emissions** from one run: `:273` (`agent_end` handler), `:395` (catch), `:413` (`result.errorMessage`), `:418` (`!outcome.ok`). A run whose package `agent_end` carries `errorMessage` **and** whose mapped outcome is not-ok emits `error` twice — the UI's terminal-state handling then depends on which one the client's SSE dispatch treats as final. `src/lib/sse-diagnostics.ts` counts events; nothing dedupes them.

**Seam:** `:54-67` + `:99-102` + `:343-376` + `:381`/`:401` → `server/services/pi-stream-watchdog.ts` exporting `createStreamIdleWatchdog({ activityAt, correlationId }) → { race<T>(p): Promise<T>; stop(): void }`. `:197-220` + `:256`–`:295` → `server/services/pi-session-options.ts`. The four error sites collapse into one `emitAgentError(onEvent, message)`.

**Benefit:** the 240 s heuristic — which carries 43 lines of rationale (`:69-100`) precisely because it has a history of false aborts — becomes testable without booting a Pi session. The double-emit becomes visible and one-line fixable.

---

### 6. Two competing boot pipelines own startup sequencing and I/O from the view root — **MEDIUM-HIGH**

**Where:** `src/App.tsx:6,46-73`, `src/main.tsx:5,15-23`

Documented boot order (`ARCHITECTURE.md:111` for the canvas path; `AGENTS.md` for storage) is: rename legacy keys → move localStorage→IndexedDB → mount. That runs in `src/main.tsx:15-23`. Startup work is nevertheless split across a second owner:

- `src/App.tsx:46-65` — a `setTimeout(…, 3000)` whose comment reads `// Defer 3s to not compete with initial render`: a **timing race standing in for a post-hydration signal**. Inside it, two GC passes read GC roots by reaching into `useGenerationStore.getState()` (`:48-50`) and `getSavedCanvasIds()` (`:58`).
- `src/App.tsx:70-73` — `setTimeout(migrateModelNodeToSettings, 0)` with the comment `// Defers a tick so persist hydration completes before we read either store`. That dependency is real (`src/lib/migrate-model-node-to-settings.ts:24-25` reads both stores synchronously) and is expressed as a **magic delay between two independent files**, not as a subscription.
- `src/App.tsx:6` — the view root imports `garbageCollect` / `garbageCollectCanvasSnapshots` from `./services/idb-storage` **directly**, not through `StoragePort` (finding 2).
- `src/lib/migrate-model-node-to-settings.ts:19-61` is a **staged-write migration orchestrator in the pure-utils layer**: it reads two Zustand stores, calls `thinking.setModel` in a loop, and owns one-shot-flag semantics (`:20`, `:59`) plus `localStorage` access (`:12`). The only pure part — `nodeTypeToTask` (`:63-70`) — is buried at the bottom.

**Seam:** one `src/services/boot-sequence.ts` exporting `runStartupTasks({ awaitHydration }): Promise<void>`, mounted from `src/main.tsx:17-23` after the persist migrations and after a `persist.onFinishHydration` await (the same primitive already used at `src/components/canvas/CanvasWorkspace.tsx:89`). Move `migrate-model-node-to-settings.ts` to `src/services/`; it is not a pure lib module. Route GC through the storage port.

**Benefit:** startup ordering becomes explicit and ordered instead of emergent from two `setTimeout` values in two files. The 3 s defer stops being load-bearing.

---

### 7. `generation-store` defines its persistence contract twice, as a 40-field manual denylist — **MEDIUM-HIGH**

**Where:** `src/stores/generation-store.ts:359-413`, `:301-319`, `:321-348`

`GenerationResult` (`src/types/provider.ts:174-247`) is a **40-field type whose doc comments repeatedly say "In-memory only … Never persisted"** (`:180-181`, `:214-219`, `:220-225`, `:227-236`, `:245-246`). Persistence correctness is enforced by a hand-maintained **denylist of 19 `delete persisted.X` lines** at `generation-store.ts:361-383`.

This is a fail-open contract: adding a new transient field to `GenerationResult` and forgetting one `delete` **silently writes live streaming telemetry into `localStorage`** until quota fails. The repo already shows awareness of the inverse risk — the same block hand-strips `evaluatorTraces` from `evaluationSummary` (`:384-388`) and `rawTrace` from each worker slot (`:398-405`), i.e. two more denylists nested inside the first.

The store also mixes **byte-store I/O into state actions**: `deleteResult` (`:301-319`) fires four `storage.delete*` calls plus four `localStorage`-backed `selectedVersions`/`userBestOverrides` purges; `deleteRun` (`:321-348`) repeats the whole pattern inside a `set()` updater; `reset` (`:350-354`) clears two IDB stores. `idbCleanup` (`:16-19`) exists purely to swallow those promises.

**Seam:** (a) declare `PersistedGenerationResult` = `Omit<GenerationResult, EphemeralKeys>` with a `const EPHEMERAL_GENERATION_KEYS = [...] as const satisfies readonly (keyof GenerationResult)[]` and project with an **allowlist** derived from the persisted Zod schema (`:76-91`) rather than a denylist. (b) Move the IDB side of `deleteResult` / `deleteRun` / `reset` into one `deleteResultArtifacts(resultIds)` in the storage layer, and let the store only mutate state.

**Benefit:** the persisted shape becomes one declaration instead of two, and a new ephemeral field can no longer leak. Storage cleanup becomes testable without a store instance.

---

### 8. `CanvasWorkspace` is a camera-command controller, a store adapter, and a React Flow mount at once — **HIGH**

**Where:** `src/components/canvas/CanvasWorkspace.tsx:53-361`

One function owns **6 hooks, 6 effects, 19 `useCanvasStore` subscriptions, 3 `getState()` reads, 2 refs**, plus the React Flow mount:

- **4 separate camera effects**, each re-implementing adapter plumbing and a `clearTimeout` cleanup: `:155-175` (starter view), `:181-192` (fit to node set), `:194-206` (focus node), `:209-224` (inspector dock fit with a `ref`-based prev/curr transition detector at `:208,210-220`).
- **Adapter derivation with domain semantics**: `:108-132` computes per-preview-node z-index promotion from generation status, including duplicate `Set` construction over the same filtered array (`:109-113`, `:114-118`).
- **Cross-store subscription breadth**: canvas + generation + app-config + React Flow store + evaluator defaults (`:79`, `:81`, `:106`) in one render scope.

**Seam:** `useCanvasCameraCommands({ fitView, setCenter, getNodes, getViewport, rfStore })` → `src/components/canvas/hooks/`, covering the four effects plus the pending-command consumption. `deriveReactFlowNodes(nodes, results)` → pure, in `src/lib/` (the z-index rule, `:108-132`). `miniMapNodeColor` (`:276-290`) is a pure type→token map and belongs in `src/lib/node-status.ts` beside `previewNodeStatus`.

**Benefit:** `src/components/canvas/__tests__/canvas-workspace.test.tsx` currently asserts camera behavior by **mocking `@xyflow/react` wholesale** (`:23-46`) and capturing props; a camera hook is testable against a plain fake viewport API with no React Flow. The z-index rule becomes a 5-line unit test instead of a prop-capture assertion.

---

### 9. `evaluator-worker-dispatch` fuses schema repair, degraded-report policy, provider calls, preview-session lifecycle, and scheduling — **HIGH**

**Where:** `server/services/evaluator-worker-dispatch.ts:26-341`

Five concerns in one 341-line module:

1. **Report schema + LLM JSON repair** — `:26-63` (schemas), `:65-127` (`coerceToArray`, `coerceFindingLikeArray`, `coerceHardFailLikeArray`, `normalizeEvaluatorWorkerPayload`), `:129-142` (`parseModelJsonObject`).
2. **Degraded-report policy** — `:144-171` (`buildDegradedReport`, `EVAL_DEGRADED_LOG_MAX`).
3. **Single-worker LLM call + rubric-mismatch guard** — `:173-229`.
4. **Browser-harness wiring and preview-session lifecycle** — `createPreviewSession` at `:259`, URL composition, `runBrowser` at `:294-305`, `deletePreviewSession` in `finally` at `:339`.
5. **Parallel-vs-sequential scheduling** — `:307-337`.

`ARCHITECTURE.md:293` assigns all five to `design-evaluation-service.ts`, which is a clean 19-line barrel (`:10`, `:11-18`, `:19`) — so the doc conflates the barrel with its implementation. The barrel is right; this file is the problem.

**Seam:** `:26-171` → `server/services/evaluator-report-schema.ts` (schemas + coercion + degraded fallback — pure, no I/O, no provider). `:259-260`, `:294-305`, `:338-339` → `server/services/browser-eval-harness.ts` exposing `withPreviewSession(files, fn)` + `runBrowserRubric`. `runEvaluationWorkers` keeps only the job table and the parallel/sequential branch.

**Benefit:** the JSON-repair layer is the highest-risk code in the evaluator (it already has a dedicated test file, `server/services/__tests__/evaluator-worker-dispatch-degraded.test.ts`) and is currently only reachable with a provider, a preview session, and Playwright in scope. The `createPreviewSession`/`deletePreviewSession` pairing — a leak hazard on any early throw — becomes structurally guaranteed.

---

### 10. Persistence-aware preview-result resolution is reimplemented three times — **HIGH**

**Where:** `src/components/canvas/nodes/VariantNode.tsx:44-122`, `src/components/canvas/VariantPreviewOverlay.tsx:100-151`, `src/components/canvas/VariantRunInspector.tsx:109-142`

All three surfaces that show a result repeat the same chain:

| Duplicated step | VariantNode | VariantPreviewOverlay | VariantRunInspector |
|---|---|---|---|
| `useVersionStack(strategyId, pinnedRunId)` | `:44-59` | `:121-133` | `:109` |
| legacy `!strategyId && refId` fallback | `:65-70` | `:135-142` | `:111-115` |
| `activeResult ?? legacyResult` | `:70` | `:142` | `:115` |
| `findStrategy(...)` for display name | `:78-82` | `:199`, `:208` | `:117-122` |
| `useResultCode` + `useResultFiles` | `:75-76` | `:144-151` | `:124-125` |
| `prepareIframeContent` + `renderErrorHtml` | `:189-196` | `:43-49` | `:131-142` |

`useVersionStack` (`src/hooks/useVersionStack.ts:19-92`) already exists as the shared seam for *version* state — but it hands back the raw `results` array (`:77`) specifically so each caller can reimplement the legacy fallback, and it duplicates the unrelated `singleFileSrc`/`htmlContent` derivation outside itself.

**Seam:** `usePreviewResult({ strategyId, pinnedRunId, refId })` → `src/hooks/` returning `{ result, strategy, variantName, code, files, isMultiFile, htmlContent, isLoading }`, absorbing the stack hook, the legacy fallback, the strategy lookup, both result hooks, and the iframe-content formatting. Shape the payload so `VariantRunInspector`'s round-selected files (finding 1) and `VariantNode`'s tab files both derive from one `files` field.

**Benefit:** three call sites and ~90 duplicated lines collapse to one. The legacy `refId` path — which exists only for pre-`strategyId` results — gets one implementation and one test instead of three untested copies.

---

### 11. `Timeline` mixes pure log transformation with two identical expansion-state machines and scroll control — **MEDIUM**

**Where:** `src/components/canvas/variant-run/Timeline.tsx:23-538` (cx 51)

The trace → view-model transformation is already written as standalone functions but lives inside the component file: `partitionToolUseTraces` (`:47-58`), `traceTimeLabel` (`:60-69`), `buildTurnSegments` (`:77-103`) — ~60 lines of pure, currently untestable-in-isolation logic that depends on `TOOL_USE_KINDS` (`:39-45`) and `STATUS_COLOR` (`:32-36`).

Two expansion-state machines are byte-for-byte equivalent modulo the state variable: `thinkingExpanded` (`:291-293`, `:320-338`) and `toolUseExpanded` (`:294-296`, `:340-358`). Each is a `resolved*Open` reader plus a `toggle*` writer with the same `isStreaming`-default rule, and the writer re-derives the default inline (`:333`, `:353`) rather than calling its own reader.

Scroll-follow is a third concern: a **string concatenation fingerprint** (`:360-367`) used as an effect key, plus near-bottom detection and a jump affordance (`:375-393`).

**Seam:** `src/components/canvas/variant-run/timeline-model.ts` — pure, exporting `buildTurnSegments`, `partitionToolUseTraces`, `traceTimeLabel`, `activeTurnId`, `scrollFingerprint`. `useDefaultOpenWhileStreaming(isStreaming)` → `src/hooks/`, replacing both maps. `useStickyBottomScroll(fingerprint, isStreaming)` → `src/hooks/`.

**Benefit:** `buildTurnSegments` — the function that decides how a run's log is cut into turns, and therefore what the whole Monitor tab shows — becomes a pure function with direct tests. `src/components/canvas/variant-run/__tests__/Timeline-tool-use-header.test.tsx` currently has to render the component to assert header copy.

---

### 12. `server/lib/` imports upward into `server/services/`, violating the only explicit hard rule in the server layer — **MEDIUM**

**Where:** `server/lib/incubator-brainstorm.ts:29-30`, `server/lib/task-agent-route-runner.ts:7`, `server/lib/completion-budget.ts:20`, `server/lib/agentic-sse-map.ts:4`

`ARCHITECTURE.md:257` states: "`server/lib/` must not import upward into `server/services/`." Five violations, zero enforcement:

| file:line | import | kind |
|---|---|---|
| `server/lib/incubator-brainstorm.ts:29` | `runTaskAgentPiSession` | runtime |
| `server/lib/incubator-brainstorm.ts:30` | `resolveTaskAgentResultFile` | runtime |
| `server/lib/task-agent-route-runner.ts:7` | `executeTaskAgentStream`, `TaskAgentResult` | runtime |
| `server/lib/completion-budget.ts:20` | `getProviderModelContextWindow` | runtime |
| `server/lib/agentic-sse-map.ts:4` | `AgenticOrchestratorEvent` | type-only (erased) |

Two of these are misplacement, not just a bad import: `incubator-brainstorm.ts:54-141` performs two sequential LLM sessions plus prompt assembly and result stitching — `ARCHITECTURE.md:257` names "orchestration and modules that need route-adjacent logging or workspace bundling" as `services/` content. `task-agent-route-runner.ts` is HTTP/SSE route scaffolding (`hono` `Context`, `streamSSE`, `:1-2`) living in `lib/`.

The `completion-budget.ts:20` case is a genuine dependency inversion with a one-line fix: its own pure function `completionBudgetFromPromptTokens` (`:63-77`) **already takes `contextWindow` as a parameter** — only the thin async wrapper `completionMaxTokensForChat` (`:79-94`) needs the registry, so the caller can pass the window in.

**Seam:** move `incubator-brainstorm.ts` and `task-agent-route-runner.ts` into `server/services/` (importers: `server/routes/incubate.ts:19-20`, `server/routes/inputs-generate.ts:9`, `server/routes/design-system.ts:6`). Invert `completion-budget.ts` by parameter. Move the `AgenticOrchestratorEvent` union (or a structural subset) into a `lib`-owned type module. Then add an ESLint `no-restricted-imports` zone encoding `ARCHITECTURE.md:257` so regression is impossible.

**Benefit:** the documented contract becomes true and machine-checked. This is the only finding whose fix is a file move plus a lint rule.

---

## Looks like a problem but is justified — do not raise again

1. **`server/services/agentic-orchestrator/` (9 files, 1 060 lines) behind a 12-line barrel.** The reference decomposition for this repo. `revision-prompt.ts` and `stop-reason.ts` were extracted specifically for testability and both have tests. The barrel preserves a stable import path. Keep.
2. **`server/services/design-evaluation-service.ts` at 19 lines.** A pure re-export barrel over three focused siblings (`evaluator-prompt-assembly`, `evaluator-worker-dispatch`, `evaluator-aggregation`). `ARCHITECTURE.md:293` describes the *set*, not this file. Barrel is correct; only the doc wording is loose.
3. **DOM identifiers inside `server/services/browser-qa-evaluator.ts:209-257` and `browser-playwright-eval-metrics.ts:22-34`.** These *construct* a browser: a `node:vm` sandbox mock and Playwright in-page `page.evaluate` template strings. `ARCHITECTURE.md:294-295` documents both modules as exactly that. Rule 3 is honored — verified zero `react`/`@xyflow`/`zustand`/`import.meta.env`/`vite` imports anywhere under `server/`.
4. **`src/lib/error-utils.ts` imported at 14 server sites, plus `src/lib/thinking-defaults.ts`, `src/api/request-schemas.ts`, `wire-schemas.ts`, `src/lib/*-zod.ts`, and the JSON-backed `feature-flags` / `thinking-defaults` / `model-capabilities` helpers.** Off the `tsconfig.server.json` allowlist but **explicitly blessed** by `ARCHITECTURE.md:256/258`, and verified pure by a transitive import walk (23 files; zero reachability into `react`, `@xyflow`, `zustand`, `src/stores`, `src/components`, `src/hooks`, `src/storage`). This is a **stale allowlist**, not a coupling breach — the fix is regenerating `tsconfig.server.json:27-53`, not moving code.
5. **`server/log-store.ts` (323 lines) owning three in-memory rings.** Sanctioned verbatim by `ARCHITECTURE.md:267`. Multi-responsibility by documentation, deliberately.
6. **`server/lib/prompts/*` re-exporting `src/lib/prompts/*`.** Explicitly sanctioned at `ARCHITECTURE.md:303` ("no server-side duplication").
7. **`server/services/pi-agent-runtime.ts`'s three named helpers.** `ARCHITECTURE.md:289` is *accurate* about `resolveProviderConfig` (`:117`), `dispatchSessionFactory` (`:143`) and `mapPackageResult` (`:172`) — they are real and separable. Only `mapPackageResult` is strictly pure (the doc's "three **pure** helpers" is loose wording). Finding 5 is about what the entry function adds, not about those three.
8. **`src/services/canvas-*.ts` importing Zustand stores.** `ARCHITECTURE.md:447` designates `src/services/persistence.ts` as the Canvas Manager compatibility layer; cross-store capture/restore is its job. Same for `src/lib/migrate-model-node-to-settings.ts` — that one *is* misfiled (finding 6), but the pattern of a service coordinating stores is correct.
9. **`src/lib/canvas-layout.ts` importing `INPUT_NODE_TYPES` from `constants/canvas`.** The constants layer is documented as the string-literal single source (`ARCHITECTURE.md:512`); layout consuming it is consistent, not a violation. (Its `:7` re-export is still a redundant convenience barrel — `canvas-store.ts:18` re-exports the same constant — but that is cosmetic.)
10. **`server/services/__tests__/*`, `server/lib/__tests__/*` importing `vitest`.** Dev-dependency test runner, not a browser API.
11. **`src/services/__tests__/compiler.test.ts:3` importing `server/lib/prompt-templates`.** The only production-graph-inverted edge in the repo, and it is test-only. Worth relocating to `server/lib/__tests__/` eventually; **LOW**, not a layering breach.
12. **`CanvasWorkspace.tsx:181-192` referencing `pendingFitNodeIds` in an effect that appears above its declaration.** Verified **not** a temporal-dead-zone bug: the `const` is at `:146`, and hooks are invoked in source order during the function body, so the variable is initialized before the effect is registered. Raised here only so it is not re-investigated.

---

## Excluded from ranking (below the 12-finding cutoff, worth a backlog line)

- **Direct `localStorage` in a component** — `src/components/canvas/OptionalInputsTip.tsx:26,36` open-codes read/write plus `try/catch` for a flag that `src/lib/storage-keys.ts:44-62` (`isStorageFlagSet` / `markStorageFlag`) already provides. Folded into finding 2, but it is the clearest single-file instance of the storage layer being bypassed from the View.
- **Shadow persist write** — `src/services/canvas-snapshot-restore.ts:89` hand-writes the spec store's persist document (`{ state: { spec }, version: 1 }`). It duplicates a private serialization format of `src/stores/spec-store.ts:175-176`; the store's own `loadCanvas` is already called one line earlier at `:46`. Folded into finding 2.
- **`/api/preview/sessions` has no API-client module.** `src/hooks/useArtifactPreviewUrl.ts:69,83` and `src/lib/preview-session-cleanup.ts:4` call `fetch` directly, while every other route family goes through `src/api/` (`ARCHITECTURE.md:406-419`). Two hand-typed response shapes (`as { id: string; entry: string }` at `:75`) and ad-hoc `Error` strings at `:74`/`:84` instead of the shared Zod response schemas. The `GET`/`DELETE` halves have no abstraction at all.
- **Boot GC I/O from the view root** — `src/App.tsx:6,46-65`. Part of finding 6.
- **`server/routes/hypothesis.ts:71`** decides provider parallelism (`getProvider(...)?.supportsParallel`) inside a route, and `:141-153` duplicates the terminal `done` tail that `executeGenerateStreamSafe` already owns (`server/services/generate-execution.ts:183-200`). `server/routes/generate.ts` (44 lines) is the shape to copy.
- **`server/services/generate-execution.ts:94-110`** — file-event replay reconciliation (diffing the final sandbox map against `emittedFilePaths` to re-emit missed `file` SSEs) sits inside the SSE transport module.
- **`server/services/task-agent-execution.ts:71-224`** — the outcome tracker (`outcome`, `errorMessage`, `resultFileUsed`, `sandboxFileCount`) is mutated at six sites across `throw` paths; one `finalizeTaskAgentRun()` would make "every path emits exactly one `task_run`" checkable by inspection.
- **Local re-export barrels that obscure the boundary** — `src/stores/canvas-store.ts:18-22` re-exports `INPUT_NODE_TYPES`, `GRID_SIZE`, `CanvasNodeType`, `NODE_TYPE_TO_SECTION`, `EdgeStatus`; `src/components/canvas/CanvasWorkspace.tsx:16,19` then imports constants from the *store*. Cosmetic, but it makes "what does the view depend on?" unreadable.
- **Stale cross-references in comments** — `server/lib/completion-budget.ts:10` cites `server/services/pi-sdk/stream-budget.ts` and `src/lib/thinking-defaults.ts:23` cites `server/services/pi-model.ts`; neither path exists. Also `src/lib/migrate-model-node-to-settings.ts:7` says "Canvas-migration v32 strips Model nodes" — the stripping migration is `migrateV31ToV32` (`src/stores/canvas-migrations.ts:609`), i.e. it runs *for* version 32.

---

## Method note

Client findings were established by reading the named files end-to-end and measuring their hook/effect/subscription/import surfaces; server findings were produced by a parallel read-only audit (rules A–G) whose key claims (the `server/lib` → `server/services` table, the four `error`-emission sites at `pi-agent-runtime.ts:273,395,413,418`, the `evaluator-worker-dispatch` preview-session/scheduling fusion, and the `browser-qa-evaluator` concern split) were re-verified directly against the source before inclusion. Byte-store usage was measured by exhaustive grep for `from '.*storage'` and `from '.*idb-storage'` across `src/`, excluding `__tests__`.
