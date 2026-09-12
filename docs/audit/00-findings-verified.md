# Audit findings — verified evidence log

Working log for the codebase audit. Each entry was reproduced or read directly in
this session; claims that could not be verified are marked as such.

---

## F1. Preview file server resolves `Object.prototype` members (VERIFIED, security)

`server/services/preview-session-store.ts:66`

```ts
const direct = row.files[normalized];
if (direct !== undefined) return direct;
```

`row.files` is a spread plain object, so a path segment matching an inherited
member resolves to a function instead of missing.

**Reproduced** against a live dev server (session carrying only `index.html`):

```
GET /api/preview/sessions/<id>/constructor   -> HTTP 200  function Object() { [native code] }
GET /api/preview/sessions/<id>/toString      -> HTTP 200  function toString() { [native code] }
GET /api/preview/sessions/<id>/valueOf       -> HTTP 200  function valueOf() { [native code] }
GET /api/preview/sessions/<id>/__proto__     -> HTTP 200  [object Object]
```

The route's own contract is `c.text('Not found', 404)` for a miss, and
`ArtifactPreviewFrame` treats a 200 as a page that loaded. Fix: `Object.hasOwn`.
The path normalizer already uses own-property checks, so this is an inconsistency
inside one module, not a missing concept.

**Behaviour note:** changing this turns a junk 200 into the documented 404, so it
is a correctness fix but does alter the response for those inputs.

---

## F2. `config/completion-budget.json` is bypassed; the package copy wins (VERIFIED)

Two tables, every value different:

| field | `config/completion-budget.json` | `packages/…/internal/completion-budget.ts:18` |
|---|---|---|
| `minCompletion` | 256 | 1024 |
| `absoluteCeiling` | 2_097_152 | 32_768 |
| `incubate` margin | 1536 | 8_192 |
| `compaction` margin | 2048 | 8_192 |
| `agentTurn` margin | 6144 | 16_384 |
| `default` margin | 4096 | 8_192 |

`buildModel()` accepts `budgetConfig` (`packages/auto-designer-pi/src/model.ts:39`)
but `host.ts:246` calls it without one, so `DEFAULT_COMPLETION_BUDGET` sets
`model.maxTokens`, which `server/lib/pi-stream-budget.ts:79` then applies as a
hard ceiling (`Math.min(model.maxTokens, …)`). The config's `absoluteCeiling`
can therefore never bind.

The package docstring at `internal/completion-budget.ts:6-7` asserts the defaults
are "aligned with the host's `config/completion-budget.json`" — they are not.

---

## F3. `config/content-limits.json` `sandbox.*` is dead (VERIFIED)

`packages/auto-designer-pi/src/internal/limits.ts:12-23` re-declares all five
sandbox limits; the live consumers are package-only
(`tools/virtual-tools.ts:107,169,197`, `tools/bash-tool.ts:56-57`,
`sandbox-overrides.ts:28-34`). `server/lib/content-limits.ts` re-reads the JSON
but its `SANDBOX_*` exports are imported only by its own test.

`limits.ts:4-6` documents a host override "by passing custom values into
`createVirtualPiCodingTools`" — that parameter does not exist
(`tools/virtual-tools.ts:473-476`). Editing the config changes nothing.

---

## F4. `server/lib/upstream-retry.ts` is a byte-identical duplicate (VERIFIED)

Identical classifier + `sleepMs` to
`packages/auto-designer-pi/src/internal/upstream-retry.ts:7-19`, which is already
publicly exported (`packages/auto-designer-pi/src/index.ts:145-152`) and is the
copy that actually drives `host.ts:53,182`. The server copy's only importer is
its own test, and the two test suites have already diverged (5 cases vs 11).

---

## F5. Mirrored modules across the package boundary (VERIFIED)

- `src/lib/resolve-virtual-asset-path.ts` vs the package twin: behaviour
  identical, comments differ. **Both live.** Guarded by a parity test added in
  this session (`src/lib/__tests__/resolve-virtual-asset-path-parity.test.ts`),
  mutation-verified in both directions.
- `src/lib/google-fonts-allowlist.ts` vs the package twin: identical, and the
  **`src/` copy has no production importer at all** — only its own test. Editing
  it changes nothing.

---

## F6. Production logged nothing for a failed run (FIXED)

`server/services/pi-agent-runtime.ts:391` gated the only log line holding the raw
`Error` (stack, `cause`, `StreamIdleError.idleMs`) behind `env.isDev`. In
production a failed run produced one user-facing sentence and no server-side
record. Now logged unconditionally. Emitted payload unchanged.

---

## F7. Background GC could reject unhandled (FIXED)

`src/App.tsx` ran two best-effort IndexedDB sweeps with `.then()` and no
rejection handler, and there is no global `unhandledrejection` handler.
`runCanvasSnapshotTx` rejects on blocked upgrade / open timeout / tx error — the
conditions the store was hardened for. Both now `.catch` and warn. No
user-visible change.

---

## F8. `pnpm knip` could not find dead code at all (FIXED)

It reported 16 "unused files"; all 16 are live. The experiment flows load via a
computed `await import(url.href)` in `loadFlow()`, and the batch scripts are
manual entry points. Entry points extended; `husky` ignored with a reason (invoked
as a binary via `spawnSync`). Knip now exits clean, so its output is trustworthy.

---

## F9. Precedence chains are the recurring defect shape (MEASURED)

`??`-chains of length ≥3, non-test:

```
useVariantNodeDebugExport.ts   5 of the 7 longest, in one 60-line file
  filesIdb ?? files ?? result.liveFiles
  codeIdb  ?? code  ?? result.liveCode
VariantRunInspector.tsx
  roundFilesFromIdb ?? selectedRound?.files ?? currentFiles
```

Up to four silent fallbacks answer "which files does this preview show?". This
is the shape behind both recent field bugs (unstyled preview, stale model label).

---

## F10. Complexity census (MEASURED)

```
1,284 functions · mean cx 5.1 · p90 11 · 143 >10 · 79 >15
cx=157  VariantRunInspector.tsx (one function, 506 lines, untested)
cx= 72  workspace-domain-migrate.ts
cx= 60  VariantNode.tsx
cx= 57  VariantPreviewOverlay.tsx
cx= 53  GeneratingFooter.tsx
cx= 52  canvas-layout.ts
depth=12 client-task-stream.ts · depth=11 sse-reader.ts, openai-chat-stream.ts
total cx 244 canvas-migrations.ts · 180 debug-markdown-export.ts
```

---

## F11. Type-safety escape hatches (MEASURED)

Zero `any`, zero `as any`, zero `@ts-ignore` in production. 275 casts across 76
boundary files, but **175 of them (64%) are in two migration files**
(`canvas-migrations.ts` 123, `workspace-domain-migrate.ts` 52). The exposure is
concentrated in persistence/deserialization, not spread thinly.

---

## Open items raised by audits, NOT yet verified by me

- `SavedCanvasSnapshotSchema` not applied on the IndexedDB library read path.
- `migrateWorkspaceDomainPersist` not total (casts then dereferences) with no
  try/catch at the hydration boundary.
- Four `idb-storage` loaders return typed values with no runtime validation.
- `server/lib/sse-task-route.ts` error tail unguarded, unlike
  `generate-execution.ts`'s `tryWriteSseErrorTail`.
- `openai-chat-stream.ts` never flushes a trailing `buffer` on `done`.
- `sse-reader.ts` `currentEvent` not reset on the success path.
- `fetchModelList` converts auth/transport failure into `200 []`.
- `server/lib` → `server/services` boundary has 5 violations and no CI rule.
- Revision-round cap `20` duplicated across env + three Zod schemas.
