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

### **B+**

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

What holds it back from an A is a single recurring defect class and its enablers. **The
same primitive is implemented independently at each call site**: the completion-budget
table exists twice with every value different (4×–64×) and the losing copy wins; the
sandbox limits are mirrored in the package so the documented config knob does nothing;
`upstream-retry.ts` is a byte-identical dead duplicate; the path resolver and the Google
Fonts allowlist are both mirrored across the package boundary, one of them dead. Three
modules declare `EvaluatorWorkerReport`. The revision-round cap `20` lives in six places.
Two YAML frontmatter parsers disagree about BOM and CRLF, in the code path that loads the
system prompt and every bundled prompt. **The documents describing these systems are
confidently wrong** — a package docstring asserts defaults "aligned with the host's
`config/completion-budget.json`" when no value matches, and `limits.ts` documents a host
override parameter that does not exist. The measurement system needed to find the real
dead code did not work: `pnpm knip` reported 16 unused files, **all 16 live**, because the
experiment flows load through a computed dynamic import. And every boundary rule in
`ARCHITECTURE.md` — including the one explicitly written down — is **unenforceable by CI**,
which is precisely how four `server/lib → server/services` violations accumulated without
anyone noticing.

The risk is concentrated rather than diffuse: the highest-complexity function in the
codebase (`VariantRunInspector`, cx=157, 506 lines, six responsibilities) has **no test at
all**, the largest untested module (`debug-markdown-export.ts`, 692 lines) has no test
file referencing it, and the workspace-domain persist migration **crashes on sparse input
and aborts hydration of the entire store** — reproduced by execution, not inferred.

In short: excellent instincts, excellent discipline in the places someone looked, and a
systematic failure to consolidate primitives or enforce its own boundaries. Most of the
gap is mechanical and closeable; almost none of it is conceptual. **B+ is a large,
well-built codebase that has been maintained faster than it has been consolidated.**

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
