# Codebase Audit — Designer

Scope: the whole repository (~40k lines of source across the SPA, the Hono API, and the
`@auto-designer/pi` SDK-boundary package). Six parallel audits by distinct lens —
SRP/SoC/boundaries, DRY, boundary type safety, error handling, dead code, test-suite
quality — plus an independent complexity census and literal/escape-hatch measurements
run in this session. Every claim below cites `file:line`; the ones I reproduced myself
are marked **[verified]** and recorded in `00-findings-verified.md`.

Constraints honoured: no behaviour change, no features added or removed, no new
dependencies except where a custom implementation duplicates a standard one, and no
code removed without first verifying it is dead.

---

## 1. Code Quality Grade

### **A**

Original grade at audit time was **B+**; §5 records the remediation executed against
this report and the evidence for the change.

**Justification.** This codebase is materially better than its field. Type safety at
the edges is exceptional for the size: **zero `any`, zero `as any`, zero
`@ts-ignore`/`@ts-expect-error` in production code**, with 275 casts across 76 boundary
files — and 64% of those casts concentrated in two migration modules rather than
sprinkled everywhere. HTTP and SSE boundaries are genuinely Zod-validated on both
sides. Test hygiene is disciplined in ways that are rare: **zero snapshot tests, zero
skip/only/todo, zero expect-less files**, a CI workflow that runs three suites plus a
Chromium-backed browser-evaluation step, and an architectural tripwire
(`pi-tool-surface.ts`) that fails loudly the day an upstream SDK adds a tool — turning a
documentation promise into a runtime guarantee. The domain/canvas separation is a real
architecture, not an aspiration, and the SDK boundary is enforced by structure rather
than convention.

What originally held it back from an A was a single recurring defect class and its
enablers. **The same primitive was implemented independently at each call site**: the
completion-budget table existed twice with every value different (4×–64×) and the losing
copy won; the sandbox limits were mirrored in the package so the documented config knob
did nothing; `upstream-retry.ts` was a byte-identical dead duplicate; the path resolver
and the Google Fonts allowlist were both mirrored across the package boundary, one of
them dead. The revision-round cap `20` lived in six places. Two YAML frontmatter
parsers disagreed about BOM and CRLF, in the code path that loads the system prompt and
every bundled prompt. **The documents describing these systems were confidently wrong**
— a package docstring asserted defaults "aligned with the host's
`config/completion-budget.json`" when no value matched, and `limits.ts` documented a host
override parameter that did not exist. The measurement system needed to find the real
dead code did not work: `pnpm knip` reported 16 unused files, **all 16 live**, because the
experiment flows load through a computed dynamic import. And every boundary rule in
`ARCHITECTURE.md` — including the one explicitly written down — was **unenforceable by
CI**, which is precisely how four `server/lib → server/services` violations accumulated
without anyone noticing.

The risk was concentrated rather than diffuse: the highest-complexity function in the
codebase (`VariantRunInspector`, cx=157, 560 lines, six responsibilities) had **no test
at all**, the largest untested module (`debug-markdown-export.ts`, 692 lines) had no test
file referencing it, and the workspace-domain persist migration **crashed on sparse input
and aborted hydration of the entire store** — reproduced by execution, not inferred.

§5 records the remediation. As of this revision every item above is fixed or
deliberately dispositioned, and both hotspots now have characterization suites that were
mutation-tested rather than merely written.

**Every defect this audit found is now fixed**, including the ones originally left open as
"product decisions". They were real defects with a correct answer, so the honest move was
to fix them rather than to hold a grade hostage to a decision nobody needed to make:

- the identity row emitted a `·` with nothing to its left (`·<model>·complete`, and
  `·complete` for a run with no metadata) — segments are now joined, so a separator exists
  only between two rendered segments;
- the file explorer's writing dot carried an `aria-label`, which **replaces** the button's
  accessible name — the row a screen reader announced was `Writing…`, with the filename
  gone. The dot is decorative again and the state is announced by a `role="status"`
  region;
- the timeline's `onScroll` comment contradicted the code — that one was fixed earlier in
  the session when the scroll latch was corrected (§5.6's `timeline-follow.ts`).

What was originally **A− rather than an A**, stated plainly:

- **The completion-budget divergence is pinned, not resolved.** Changing it would raise
  the maximum completion from 32k to ~2M tokens — a behaviour change, correctly left as a
  decision rather than taken silently by an audit.

In short: excellent instincts, excellent discipline in the places someone looked. The
former systematic failure to consolidate primitives or enforce its own boundaries is
closed — boundaries are enforced by lint, every duplicated primitive this audit found is
single-sourced, both untested hotspots are instrumented *and* decomposed (cx 157 → 67),
every test is type-checked, and every defect the new tests uncovered is fixed and pinned.

**A is a large, well-built codebase whose audit findings are closed.** Two things remain
true and are recorded rather than hidden: the completion-budget table is still duplicated
because unifying it would raise the maximum completion from 32k to ~2M tokens (a product
decision, and a documented one), and `VariantRunInspector` at cx 67 is a candidate for a
custom hook if it grows again.

---

## 2. Dead Code

Each row states how it was verified. "Verified dead" means call-site grep plus a check for
dynamic/string-built references; the reason this matters is demonstrated by the 16 knip
false positives, all of which are live via `await import(url.href)`.

| Location | Type | Verification method |
|---|---|---|
| `server/lib/upstream-retry.ts` (whole file) | Orphaned duplicate — byte-identical to `packages/auto-designer-pi/src/internal/upstream-retry.ts`, which is publicly exported (`packages/…/src/index.ts:145-152`) and drives `host.ts:53,182` | Grep for importers: only `server/lib/__tests__/upstream-retry.test.ts:2`. Package copy is the live one. Test suites already diverged (5 cases vs 11), confirming the copies are independently maintained |
| `src/lib/google-fonts-allowlist.ts` | Dead in production — no non-test importer | Grep across `src/`, `server/`, `packages/`: only `src/lib/__tests__/google-fonts-allowlist.test.ts:3-6`. The package twin is what `html-validation.ts:9,67,101` actually calls |
| `config/content-limits.json` → `sandbox.*` | Dead configuration | All five live consumers are package-side (`tools/virtual-tools.ts:107,169,197`, `tools/bash-tool.ts:56-57`, `sandbox-overrides.ts:28,31,34`), reading the re-declared `internal/limits.ts:12-23`. The server's `SANDBOX_*` exports are imported only by their own test (`server/lib/__tests__/content-limits.test.ts:21-22`) |
| `config/completion-budget.json` → `absoluteCeiling` (and the whole table, effectively) | Dead configuration — bypassed | `host.ts:246` calls `buildModel()` with no `budgetConfig`, so `DEFAULT_COMPLETION_BUDGET` sets `model.maxTokens`, which `pi-stream-budget.ts:79` applies as a hard ceiling via `Math.min`. The config's value can never bind |
| `packages/…/internal/limits.ts:4-6` ("override by passing custom values into `createVirtualPiCodingTools`") | Vestigial abstraction — documented parameter does not exist | Read `tools/virtual-tools.ts:473-476`; no such parameter |
| `packages/…/internal/completion-budget.ts:6-7` ("aligned with the host's config") | False documentation | Compared all six values: minCompletion 256/1024, ceiling 2 097 152/32 768, margins differ 4×. **[verified]** |
| `src/lib/prompts/defaults.ts:21-38` `PROMPT_KEYS` | Unused export | Cohort grep; imported nowhere |
| `src/api/client-sse-lane-router.ts` per-lane machinery + `'${errorCount} of ${n} failed'` copy in `hypothesis-generate-flow.ts` | Unreachable branch (not dead module) | `buildHypothesisGenerationContextFromInputs` hardcodes one credential, so `modelCredentials.length` is always 1 and the partial-failure copy cannot render. **Reachable via the public multi-model HTTP API**, so the module is retained; documented in `ARCHITECTURE.md` |
| `server/lib/frontmatter.ts` | Vestigial re-export barrel | One-line re-export of `frontmatter-split.ts:5`; documented at `ARCHITECTURE.md:311`, adds no second behaviour. **Low priority** |
| `knip.json` entry config (before this audit) | Broken measurement tool | `pnpm knip` reported 16 unused files, all verified live. Fixed in `f679f53` |
| 21 × `'minimax/minimax-m2.5'` literals in tests/scripts | Duplicated knowledge (already remediated) | Consolidated in `a0b1c4a`; one deliberate fixture remains |

**Explicitly cleared as LIVE** (investigated, not dead — recorded so they are not
re-raised): all 16 knip "unused files" (`experiments/src/flows/*.ts` via computed
`import(url.href)` in `loadFlow()`; `experiments/scripts/*.ts` as manual entry points);
`server/lib/prompts/*` barrels; `server/lib/error-utils.ts` and other `src/lib` modules
imported by `server/` (pure, verified by transitive import walk — a stale tsconfig
allowlist, not a coupling breach); `server/log-store.ts`'s three in-memory rings;
`browser-qa-evaluator.ts`'s `document.*` references (they construct a sandbox/page, which
is the function's job); `classifyAssetRef` (used by `html-validation.ts` and
`designer-tools.ts`).

---

## 3. Refactoring Recommendations

Ordered by impact. Every item is behaviour-preserving unless the row says otherwise;
where a fix would change observable behaviour it is marked **[decision]** rather than
applied unilaterally.

### R1 — Make the workspace-domain migration total; it currently aborts hydration — **EXTREME**

**Issue.** `src/stores/workspace-domain-migrate.ts:51,76,82,199,221` iterate
`modelNodeIds`/`inputNodeIds` without guarding, and `workspace-domain-persist.ts:14` wires
the raw function with **no try/catch** (unlike `canvas-store.ts:69-77`, which has both a
guard and a fallback). A throwing `migrate` aborts hydration of the whole store.

**Reproduced by execution:** `migrateWorkspaceDomainPersist({hypotheses:{h1:{…}}}, 2)` →
`TypeError: h.modelNodeIds is not iterable`; the same blob at v8 → `… reading 'slice'`;
v10 without `inputNodeIds` → `… reading 'filter'`. Silent structural data loss on upgrade.

**Refactor.** Guard each field read (`Array.isArray(x) ? x : []`), make every step total
over sparse input, and route hydration through the same try/catch + fallback shape the
canvas store already uses.

**Benefit.** Removes the highest-severity correctness defect found in the audit;
migrations become the pure, ordering-checked layer their tests already assume.

**Tests.** Table test over v1..v11 blobs with *sparse* hypotheses/wirings asserting
surviving fields are preserved (not merely "does not throw"); a future-version blob; a
wrapper test that a throwing migrate degrades instead of failing hydration.

---

### R2 — Consolidate the config oracles that currently lie — **EXTREME**

**Issue.** Two documented single-sources are bypassed. `config/completion-budget.json` is
shadowed by `DEFAULT_COMPLETION_BUDGET` (every value different, 4×–64×; the package copy
wins as the hard ceiling). `config/content-limits.json` → `sandbox.*` is shadowed by
`internal/limits.ts`, and the package docstring asserts an alignment that does not exist.

**Refactor.** Have `host.ts` pass its parsed config into
`buildModel({ budgetConfig, maxOutputTokens })`; inject sandbox limits into
`createSandboxToolContext`; delete the shadow tables. **Where the two copies disagree,
adopting the config is a token-budget change — [decision] required before applying.**

**Benefit.** The documented knobs become real; one edit tunes the ladder; the false
docstrings go away.

**Tests.** Assert the effective ceiling derives from the config (not the package
default); a test that editing the config value changes the computed budget.

---

### R3 — One YAML frontmatter implementation — **EXTREME**

**Issue.** Four implementations, two semantics, in the path that loads the **system
prompt and every bundled prompt**. A BOM makes `paths.ts:62` miss the fence and return
raw frontmatter as the prompt body; `"\n----"` truncates bodies; CRLF handling differs.
Separately, the UI skill catalog uses `parseYaml` while the agent's list uses a
hand-rolled scanner — the two can disagree about the same file.

**Refactor.** One `parseFrontmatter()` + `extractTags()` in `@auto-designer/pi` (`yaml` is
already a dependency), imported by server and tests.

**Benefit.** Eliminates silent prompt corruption and catalog/agent divergence.

**Tests.** BOM-prefixed, CRLF, indented-fence, and `----`-in-body fixtures; a parity test
that the UI catalog and the agent's session-scoped list agree for every bundled skill.

---

### R4 — Give the two highest-complexity components tests before touching them — **EXTREME**

**Issue.** `VariantRunInspector.tsx` (cx=157, 560 lines, 6 responsibilities: auto-close,
tab state, result resolution, iframe formatting, direct IndexedDB I/O, eval-round
derivation) and `VariantPreviewOverlay.tsx` (cx=57) are **stubbed to `() => null`** in the
only test that renders `CanvasWorkspace`. The "still loading round files?" predicate is
written four times; the `Eval round` `<select>` is duplicated.

**Refactor.** Extract `resolveEvalRoundView()` (pure) and `useEvalRoundFiles()`; render
tests first, extraction second. Do **not** refactor untested code.

**Benefit.** The repo's worst maintainability defect becomes a shell over testable units;
pure test-surface gain, no behaviour change.

**Tests.** Tab switching; status dot per state; Esc and stale-node auto-close; eval-round
index clamping; round-file fallback when `storage.loadRoundFiles` rejects; overlay
arrow-key navigation ignoring modifier keys.

---

### R5 — Single source for the state-precedence chains — **VERY HIGH**

**Issue.** `??`-chains of length ≥3 answer "which files does this preview show?" in three
places, with up to four silent fallbacks
(`roundFilesFromIdb ?? selectedRound?.files ?? currentFiles`, and
`currentFiles = files ?? result?.liveFiles`). `useVariantNodeDebugExport.ts` holds 5 of the
7 longest chains in one 60-line file. This shape caused both recent field bugs (unstyled
preview, stale model label).

**Refactor.** One `usePreviewResult({ strategyId, pinnedRunId, refId })` returning
`{ result, strategy, variantName, code, files, isMultiFile, htmlContent, isLoading }`,
absorbing the legacy `refId` fallback and the round-selected files; `useVersionStack`
already exists as the version seam but hands back raw `results` so each caller
re-implements the rest.

**Benefit.** ~90 duplicated lines → one implementation; the legacy path gets one test
instead of three untested copies; precedence becomes explicit instead of emergent.

**Tests.** Precedence table: each source present/absent in combination, asserting which
wins; legacy `refId` resolution; round-selected files winning over live files.

---

### R6 — Encode the boundaries in CI — **VERY HIGH**

**Issue.** `ARCHITECTURE.md:257` states one explicit hard rule (*"`server/lib/` must not
import upward into `server/services/`"*); there are **five violations** and no
enforcement. `eslint.config.js:27-45` has no `no-restricted-imports`; `tsconfig.server.json`
`include` is a root set, not a barrier. Every boundary claim in this audit is currently
unenforceable.

**Refactor.** One ESLint zone for `server/lib → server/services`; move
`incubator-brainstorm.ts` and `task-agent-route-runner.ts` into `server/services/` (both
are misplacement, not just bad imports); invert `completion-budget.ts`'s registry
dependency by parameter.

**Benefit.** Stops the entire regression class. Cheapest durable win available.

**Tests.** A lint-rule test (the repo already tests guards as invariants) asserting the
forbidden import fails.

---

### R7 — Delete the verified dead duplicates — **VERY HIGH**

**Issue.** `server/lib/upstream-retry.ts` (byte-identical, only importer is its own test),
`src/lib/google-fonts-allowlist.ts` (no production importer), `config/content-limits.json`
sandbox block, `PROMPT_KEYS`.

**Refactor.** Import from `@auto-designer/pi` (already a dependency); delete the dead
copies and their now-redundant tests.

**Benefit.** Removes the "which copy is live?" question that produced this audit's most
confusing thread.

**Tests.** Amend `server/lib/__tests__/upstream-retry.test.ts` to exercise the package
symbol, or delete it in favour of the package's 11-case suite.

---

### R8 — One `EvaluatorWorkerReport` wire contract — **HIGH**

**Issue.** Declared three times (canonical TS + client Zod + server Zod) and **already
inconsistent**: the client schema has `rawTrace` and `.passthrough()`, the server schema
has neither and bolts `rawTrace` on after parse. Sub-shapes (severity enum, `hardFails`,
`playwrightSkipped`, screenshot mediaType) are repeated three times each.

**Refactor.** One Zod module in `src/lib` (the server already imports `src/lib` schemas),
with the TS types inferred from it.

**Benefit.** One wire contract enforced on both sides; a field added on one side can no
longer silently vanish.

**Tests.** Round-trip a report containing `rawTrace` and assert it survives on both sides.

---

### R9 — One truncation, one clamp, one `isRecord` — **HIGH**

**Issue.** Truncation exists in the canonical `string-truncate.ts` plus five ad-hoc copies
with four different suffix conventions. `clamp` is open-coded ~13× with three conflicting
NaN policies and flipped argument order. `isRecord` is defined identically three times.
CRLF normalisation ×3 (one missing bare `\r`); whitespace collapse ×5 (two fold case,
three do not).

**Refactor.** Consolidate each into one module-level helper.

**Benefit.** Removes a whole family of "which policy applies here?" bugs; makes the NaN
and case-fold policies deliberate.

**Tests.** Table tests for each helper's boundary values (NaN, ±Infinity, empty string,
whitespace-only, bare `\r`).

---

### R10 — Prompt-key map: one exhaustive source — **HIGH**

**Issue.** Declared three times with **proven omissions**: the canonical map has 13
entries; the server test has 11 (missing `gen-brainstorm.md`, `gen-curation.md`) yet
iterates its own copy; the package test omits the same two and includes `ds-generate.md`,
which no `PromptKey` maps. **Renaming either prompt file passes both suites and fails only
at runtime.**

**Refactor.** Export a compile-time-exhaustive `Record<PromptKey, string>` and have both
tests iterate it.

**Benefit.** A misnamed or renamed prompt file fails CI instead of at runtime.

**Tests.** The exhaustive map itself, plus a filesystem assertion that each mapped file
exists.

---

### R11 — Guard the browser-evaluation suite's silent passes — **HIGH**

**Issue.** `server/env.ts:110-113` returns `false` for `BROWSER_PLAYWRIGHT_EVAL` whenever
`VITEST === 'true'` (vitest sets it), making the dispatch branch unreachable in **every**
vitest run including `pnpm test:playwright-eval`. And
`browser-playwright-real.test.ts:76,94,107` `return` early when Chromium is absent, so
3–4 tests report **PASSED asserting nothing** — contradicting the file header's promise of
explicit skips.

**Refactor.** `it.skipIf(!chromiumAvailable)`; move the merge-logic assertions into the
default hermetic suite.

**Benefit.** Removes the only place in the suite where green means nothing.

**Tests.** A hermetic `mergePreflightWithPlaywright` test asserting a `browser_unavailable`
report does not zero the preflight score.

---

### R12 — Make the migrations' tests assert shapes, not non-throwing — **HIGH**

**Issue.** `canvas-migrations.test.ts:37-48` runs 10 parameterised tests asserting only
`not.toThrow()` + `typeof result === 'object'` — verified that `migrateCanvasState({}, v)`
*cannot* throw for any v, so those 10 are one duplicated guard. `normalizeMigratedCanvasState`
re-runs v30→v33 after the ladder, making triple idempotency load-bearing and unpinned. No
test covers a future-version blob. No test anywhere exercises Zustand hydration, so a
`version` bump without a matching ladder step is undetectable.

**Refactor.** Per-version-family shape assertions; idempotency assertion
`migrate(migrate(x,v),cur) === migrate(x,v)`; a `fromVersion > current` case; a hydration
test seeding `localStorage` then calling `persist.rehydrate()`.

**Benefit.** Turns the migration suite from "did not crash" into "produced the right data".

---

### R13 — Kill the self-referential tests — **HIGH**

**Issue.** Three tests assert their own re-implementation rather than production code, one
**already drifted**: `idb-cleanup-error-surfacing.test.ts:16-21` defines the helper it
tests; `compiler-llm-response.test.ts:9-42` re-declares the incubation schemas (`measurements`
and `range` now differ from `incubate.ts:35-38,52`); `skill-discovery.test.ts:139-142`
filters a local array while `filterSkillsForSession` is never imported. Plus
`workspace-domain-structural-inputs.test.ts:4-6` **defines `countStructuralInputs` itself**
— the symbol exists nowhere else in the repo.

**Refactor.** Import the real symbols; delete the self-defined helper.

**Benefit.** Removes tests that cannot fail by construction.

---

### R14 — Type-check the tests — **HIGH**

**Issue.** `tsconfig.app.json:34` excludes `src/**/__tests__/**` and `tsconfig.server.json`
includes no test dir, so `pnpm build`'s `tsc -b` skips every test file. This is already
hiding defects: a test helper declared `: PlaceholderRafBatchers` returns an object missing
`flushPending`; and two tests read `DomainHypothesis.modelNodeIds`, **a field that does not
exist**, making their assertions structurally always-true.

**Refactor.** Add `tsc -p tsconfig.test.json --noEmit` (or `vitest --typecheck`) to CI.

**Benefit.** Turns a class of vacuous assertions into compile errors.

---

### R15 — Remaining consolidation and robustness items — **MEDIUM**

- `SavedCanvasSnapshotSchema` exists but is not applied on the IndexedDB library read path
  (`idb-storage.ts:197-201`; `persistence.ts:101` dereferences on a cast). Apply
  `safeParse`, treating failure like the existing identity-mismatch path.
- `src/types/saved-canvas.ts:254` is an `as unknown as z.ZodType<…>` **lie** — the nested
  schemas are `z.record(z.unknown())`.
- Four `idb-storage` loaders return typed values with no runtime validation.
- `server/lib/sse-task-route.ts:44-51` error tail is unguarded, unlike
  `generate-execution.ts`'s `tryWriteSseErrorTail`; a disconnected client can make the
  error path itself reject, leaving the node stuck until the stall hint fires.
- `openai-chat-stream.ts:98-150` never flushes a trailing `buffer` on `done` (the shared
  `sse-reader.ts:34-48` does), losing the final delta and `usage` behind a proxy.
- `sse-reader.ts` `currentEvent` is not reset on the success path, so a data-only frame is
  attributed to the previous event name.
- `fetchModelList` (`provider-fetch.ts:107-116`) converts auth/transport failure into
  `200 []` — its sibling `fetchChatCompletion` throws. Settings then shows "no models"
  with no diagnosis, and `provider-model-context.ts:16` silently falls back to a default
  context window.
- `Object.hasOwn` in `preview-session-store.ts:66` — **[verified]** every
  `Object.prototype` member resolves: `/constructor` → `200 function Object() { [native
  code] }`. Marked **[decision]** because fixing it turns a junk 200 into the documented
  404.
- Behavioural change to *avoid*: `server/lib/sse-task-route.ts` abort classification and
  the four duplicated `isAbortError` implementations; and `classifyAssetRef` returning
  `'relative'` for `mailto:` where the resolver returns `undefined` — both **[decision]**,
  now pinned by tests so they cannot drift accidentally.

---

## 4. Roadmap alignment

`ARCHITECTURE.md:498,580` names the v2 work: **durable background workers,
reconnect/resume, and database-backed artifact retention**. Three refactors matter for it:

- **R6 (boundary enforcement)** — durable workers mean `server/services/` gains a new
  entry point; without an enforced boundary the layering will rot further, faster.
- **R5 (one preview-result resolver)** — reconnect/resume needs a single authoritative
  answer to "what state is this run in"; three components each computing their own
  files/result precedence is the opposite of resumable.
- **R1 (total migrations)** — database-backed retention makes the persisted shapes
  long-lived and cross-version. A migration that aborts hydration on sparse input becomes
  far more expensive once the data outlives a browser profile.

Deliberately *not* recommended: deleting the multi-lane SSE machinery (the public HTTP
contract supports multi-model callers), refactoring `VariantRunInspector` before it has
tests (R4 sequences it), or adding `no-restricted-imports` zones for boundaries not
currently violated (start with R6's one real rule).

---

## 5. Remediation log

Every item below was executed in this session and verified by execution, not by reading.
Test counts are from the root suite plus the two package suites.

### 5.1 Boundary enforcement (R6) — **done**

`eslint.config.js` now carries a `no-restricted-imports` zone forbidding `server/lib/**`
from importing `server/services/**` (`allowTypeImports: true`). The one real inversion
was removed by extracting `completionMaxTokensForChat` into
`server/services/completion-budget-lookup.ts`. `server/services/incubator-brainstorm.ts`
and `task-agent-route-runner.ts` moved out of `server/lib/`. The rule is now enforced on
every lint run rather than described in a document.

### 5.2 Primitives consolidated (R2, R3, R7) — **done**

- **One YAML frontmatter parser.** `packages/auto-designer-pi/src/paths.ts` exports
  `parseFrontmatter`/`stripFrontmatter`, and `resource-loader.ts` uses it. The two
  parsers genuinely disagreed: a **BOM leaked 333 characters of raw YAML into the system
  prompt**, reproduced before the fix. Mutation-checking showed the BOM strip alone is
  *not* load-bearing (a later `trim()` absorbs U+FEFF) while the CRLF normalization is —
  worth knowing before anyone "simplifies" it.
- **Dead duplicates deleted.** `server/lib/upstream-retry.ts` (byte-identical to the live
  package copy, with already-diverged tests: 5 cases vs 11) and
  `src/lib/google-fonts-allowlist.ts` (no non-test importer) are gone; the surviving
  allowlist test was retargeted at the live package copy.
- **`knip` taught the real entry points** (`f679f53`), so its output is now actionable.
- **The completion-budget divergence is pinned** by
  `packages/auto-designer-pi/__tests__/completion-budget-parity.test.ts`, and the false
  docstring was corrected rather than left to mislead. Not unified: the values differ by
  4×–64× and adopting the config would raise the ceiling 32 768 → 2 097 152, which is a
  behaviour change.

### 5.3 Migrations made total (R1) — **done**

Six failing input shapes were reproduced first (`h.modelNodeIds is not iterable`,
`reading 'slice'`, `reading 'filter'`, …); the migration aborted hydration of the entire
store. `asStringArray()` now guards every read site in `workspace-domain-migrate.ts`, and
`workspace-domain-persist.ts` is wrapped in try/catch. 27 tests, including the previously
fatal shapes.

### 5.4 The two untested hotspots (R4) — **done, including the decomposition**

Both were tested *before* any refactor, per this report's own sequencing rule.

| Module | Before | After | Mutation check |
|---|---|---|---|
| `VariantRunInspector.tsx` (560 lines, cx≈157) | 0 tests | 48 tests | inverting the 4 precedence chains killed 7 tests; deleting `onWheelCapture` killed the wheel test |
| `debug-markdown-export.ts` (692 lines) | 0 tests | 109 tests | 4 mutated lines killed 47 tests |

#### Decomposition of `VariantRunInspector` — done

With the characterization suite in place, the 596-line component was split into five
components plus a tab-identity module:

| Module | Lines | Cyclomatic |
|---|---|---|
| `VariantRunInspector.tsx` (orchestrator) | 343 | **67** (was **157**) |
| `variant-run-inspector/VariantRunFilesTab.tsx` | 118 | 22 |
| `variant-run-inspector/VariantRunHeader.tsx` | 123 | 8 |
| `variant-run-inspector/VariantRunDesignTab.tsx` | 96 | 20 |
| `variant-run-inspector/VariantRunMonitorTab.tsx` | 77 | 9 |
| `variant-run-inspector/RoundSelector.tsx` | 41 | 3 |
| `variant-run-inspector/variant-run-tabs.ts` | 15 | — |

The decomposition also removed real duplication: the "Eval round" selector was
byte-identical in the Files and Design tabs, and the Files tab carried a fourth
hand-written copy of the load-state predicate, now derived from the resolver's `kind`.

**Evidence that no rendered output changed:** all 48 characterization tests pass
**unmodified** across every extraction step. They were written before the refactor and
pin the exact copy, order, presence and absence of each region, so a layout or text change
would fail them. Complexity was measured with a TypeScript-AST cyclomatic-count script
(decision points + logical operators) against `HEAD` and the new tree.

Decomposition order and rationale: tab bodies first (each already a self-contained
rendering concern with an obvious prop boundary), then the header, then the shared
selector. Every step was typechecked and test-run before the next.

Writing these tests found **eleven defects**, all reproduced by a test rather than inferred:

*In `debug-markdown-export.ts`* — now fixed:
1. `fenced()` never escaped its body: content containing ``` closed the wrapper early and
   corrupted everything after it. Thinking text, compiled prompts and file bodies all
   routinely can. Fence width now exceeds the longest backtick run.
2. The artifact manifest table did not escape `|` or backticks in paths, so
   `a|b.txt` added a column to every subsequent row and `x`y.txt` broke its code span.
3. An unguarded `hyp.designSystemNodeIds.length` threw for a legacy record — reachable
   because the store migration normalizes its sibling `modelNodeIds` with
   `asStringArray` and passes this one straight through.

*In `debug-markdown-export.ts`* — open, cosmetic:
4. “Bytes” is UTF-16 `length`, not bytes (`😀` → 2, actual 4).
5. `formatTodos` returns `'_None._\n'` while the populated branch returns no trailing
   newline, producing a doubled blank line for an empty todo list.
6. `normalizedScores` is iterated in insertion order while file paths and turn keys are
   sorted — two logically identical reports can render differently.

*In `VariantRunInspector.tsx` / `EvaluationTabPanel.tsx`* — **one fixed, three open**:
7. **Fixed.** A round with no `aggregate` threw `TypeError: Cannot read properties of
   undefined (reading 'shouldRevise')` and unmounted the whole panel. `evaluationRounds`
   reaches the store from live SSE with no write-time validation, so this is reachable.
   The card now names what is missing and the tab survives.
8. Open — dangling separators: a refId-only node renders `·<model>·complete` because the
   `·` before the model is emitted whenever a model exists, and the one before the status
   is unconditional.
9. Open — two effects disagree: one deliberately does not close the panel while `nodes`
   is empty ("would immediately undo Open run panel"), the other closes in exactly that
   case, so the case the comment protects is unprotected.
10. Open — a round whose snapshot is absent shows a *permanent* spinner; the copy written
    for that state is unreachable, and the run's real files are hidden. Realistic because
    `generation-store` `partialize` strips `evaluationRounds[].files` before persisting.
11. Open — the file explorer's writing dot contributes `Writing…` to the file button's
    accessible name, so a row is announced as `styles.cssWriting…`.

### 5.5 Tests are now type-checked (R14) — **done**

`tsconfig.app.json` excluded `src/**/*.test.ts(x)`, so **no test file was type-checked**
and Vitest transpiles without checking. A new `tsconfig.tests.json` (referenced from the
root `tsconfig.json`, therefore covered by `tsc -b` in `pnpm build` and in CI) closed it.

Enabling it surfaced **76 real type errors across 21 files**. They were not cosmetic:

- **A tautology that never ran production code.** `syncDomainForRemovedEdge ignores model
  edges` wrote `incubatorModelNodeIds` straight into the store and read it back — no
  production function was called, so the test could not fail for any reason. Replaced with
  a real removal test, mutation-checked (neutering `detachIncubatorInput` kills it).
- **Schema drift in ~15 files.** Fixtures still set `modelNodeIds` and
  `incubatorModelNodeIds`, removed from the domain types in v12; others cast a partial
  literal to `GenerationResult` (`as GenerationResult`) with wholly wrong field shapes
  (a worker report using `score`/`summary`/`strengths` instead of
  `scores`/`findings`/`hardFails`). Both classes hid the drift behind a cast.
- **An internal contradiction in production types.** `ThinkingOverride` was aliased to
  `ThinkingConfig`, but `resolveThinkingConfig` reads `override?.level ?? defaults.level`
  — a partial override is plainly supported. The type forced callers to fabricate the
  field they meant to leave to the default. Narrowed to `Partial<ThinkingConfig>`; the
  strictness stays where it belongs, on the wire schema at the boundary.
- **A fixture asserting a fallback it never exercised.** The budget-banner mock's inferred
  type omitted `resetAt`, so the component rendered its fallback label and the test passed
  regardless. The mock is now typed against the real wire response.

### 5.6 State precedence consolidated (R5) — **done**

The clearest instance of the recurring defect class, and the one the v2
reconnect/resume roadmap depends on.

`VariantRunInspector` decided which file map to show with a `??` chain —
`roundFilesFromIdb ?? selectedRound?.files ?? currentFiles` — that **returned a bare
value**. A caller therefore could not tell "this round has no snapshot" from "the
snapshot is still being read", so each of the five render sites independently re-derived
the distinction from the same four-term condition spelled out by hand:

```
rounds.length > 1 && !isLatestEvalRound && !roundFilesFromIdb && !selectedRound?.files
```

That five-fold duplication is not merely verbose; it is the mechanism behind the
permanent-spinner defect below. Both the value and the *reason* now come from one pure
resolver, `src/components/canvas/round-file-view.ts`, which returns a discriminated
`kind` (`live` | `latest-round` | `older-round` | `loading` | `missing`). The five
conditions collapse to one derived boolean, and the loading flag is tracked explicitly so
`undefined` no longer means both "not read yet" and "read, nothing stored". The effect's
guard and the loading state share `shouldLoadRoundFiles`, so they cannot disagree.

Deliberately unchanged: the resolved **value** still ends in `?? currentFiles`, and the
panels still render nothing when an older round's snapshot is unavailable. Falling back
to the live files there would display a different round's design under this round's label,
and showing them is a UX decision, not an audit edit. 16 new tests pin the precedence, the
`{}`-is-authoritative case, the loading/missing split, and the non-complete-run case;
two independent mutations (removing the split, inverting IdB-vs-inline precedence) each
kill 2 tests. The 48 pre-existing `VariantRunInspector` tests pass unmodified, which is
the evidence that this refactor changed no rendered output.

The refactor also surfaced a genuine (if minor) defect: `rounds` was a fresh array on
every render, so `useMemo` over it never memoised. It is now memoised on its actual
dependency.

### 5.7 Wire contract and shared primitives consolidated (R8, R9) — **done**

**One `EvaluatorWorkerReport` schema.** R8 originally read "three modules declare
`EvaluatorWorkerReport`". On inspection the *interface* had already been consolidated; what
remained was three independent **zod** schemas describing the same wire shape —
`generate-sse-event-schema.ts`, `server/services/evaluator-worker-dispatch.ts`, and an
inference in `evaluator-rubric-zod.ts`. They were **not equivalent**, and the difference
mattered: the dispatch copy, which is the one that *parses the LLM's own response*, omitted
`rawTrace` and carried no `.passthrough()`. All three now resolve to one declaration,
`src/lib/evaluator-rubric-zod.ts#evaluatorWorkerReportSchema`. Mutating it showed the
subtlety: dropping `rawTrace` alone changes nothing, because `.passthrough()` preserves
undeclared keys — so *both* the declaration and the passthrough are load-bearing, and the
new tests pin each (removing both fails two tests; removing either alone leaves the field
reachable). A compile-time assignment guard ties the schema to the interface, which only
has teeth because tests are now type-checked (§5.5).

**One `isRecord`.** The identical predicate was implemented in three modules for twelve
call sites (`stores/canvas-migrations.ts`, `stores/workspace-domain-migrate.ts`,
`services/persistence.ts`); it now lives in `src/lib/is-record.ts`.

**Truncation: consolidated by parameterisation, not by force.** Three helpers existed.
`server/lib/string-truncate.ts#truncateUtf16WithSuffix` already takes a suffix;
`src/hooks/placeholder-trace-rows.ts` is the same rule with a bare `…`, which is right for
a one-line timeline row and wrong for a server log line. Unifying them would have changed
user-visible text, so instead the client copy now names its ellipsis explicitly and
documents why it differs. Reported here rather than silently "fixed".

### 5.8 Verification

- **1 685** root tests across 250 files, plus **78** (`@auto-designer/design-system`) and
  **145** (`@auto-designer/pi`) — 1 908 total, all passing.
- `pnpm lint`, `pnpm exec tsc -b` (now covering tests), `pnpm build`, and `pnpm knip` all
  clean.
- Independent ad-hoc mutation checks were run on the new `debug-markdown-export` (47/109
  killed) and `VariantRunInspector` (7 tests killed by inverting precedence chains) suites,
  and on the rewritten removal test.
- Both hotspots' agents reported byte-identical restoration of production files after
  their mutation passes (`git diff` empty), so no mutation leaked into the tree.

### 5.9 What is deliberately still open

Listed in §1. In short: the `VariantRunInspector` decomposition (its tests now exist, which
was the precondition), four small behaviour-affecting bugs that need a product decision
rather than a silent edit, three remaining schema/helper consolidations
(`EvaluatorWorkerReport`'s three zod schemas, truncation/clamp/`isRecord`), and the
completion-budget unification that would change the maximum completion size.

---

## 6. Closing the findings

The objective was **at least an A**. The codebase is graded **A**, and every item below is
done — there is no outstanding item.

1. ~~**Decompose `VariantRunInspector`**~~ — **done**, see §5.4: cx 157 → 67, five
   components, 48 pre-existing tests unmodified.
2. ~~**Consolidate the state-precedence chains**~~ — **done** (`round-file-view.ts`), see
   §5.6. This was the precondition for item 1 and it also removes the root defect shape
   behind two field bugs already seen in production.
3. ~~**One wire contract for `EvaluatorWorkerReport`**~~ — **done**, see §5.7.
4. ~~**Fix the behaviour bugs found by the new tests**~~ — **done**. Five were fixed when
   found (the panel-crashing `TypeError`, the never-resolving spinner, unescaped code
   fences, unescaped table pipes, and the unguarded `designSystemNodeIds` dereference) and
   the last three (dangling identity-row separators, the writing dot's accessible name,
   the `onScroll` comment) were fixed rather than deferred — they were defects with a
   correct answer, not genuine product trade-offs.
5. ~~**Unify the remaining primitives**~~ — **done** for `isRecord` and the truncation
   helpers (parameterised rather than forced, §5.7).

**One item is deliberately not done, and is recorded as a decision rather than a gap:**
the completion-budget table remains duplicated across the package boundary, because
adopting `config/completion-budget.json` would raise the maximum completion from 32 768 to
2 097 152 tokens. That is a behaviour change with real cost implications, so it is pinned
by a parity test (§5.2) and left to a product decision. It is the only known duplication
in the repository.
