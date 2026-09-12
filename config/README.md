# `config/` — human-editable application knobs

This directory contains Designer's checked-in product configuration. All files are JSON, validated by Zod at server boot. **Edit a file, run `pnpm build` (or `pnpm test`), and the new values apply everywhere — server routes, client UI, and evaluation workers.**

No TypeScript knowledge required. If you type the wrong thing (e.g. a string where a number is expected), the app refuses to start and the error names the exact path.

---

## Files at a glance

| File | Controls | Changing it affects |
|---|---|---|
| [`feature-flags.json`](feature-flags.json) | On/off switches for major product features | Which features are available in the UI and enforced server-side |
| [`task-defaults.json`](task-defaults.json) | Provider + model defaults per LLM task | Which provider/model each task uses before user overrides, and lockdown pins |
| [`openrouter-routing.json`](openrouter-routing.json) | OpenRouter provider-routing overrides by model | Which OpenRouter provider endpoint selected models must use |
| [`thinking-defaults.json`](thinking-defaults.json) | Thinking level + budget tokens per LLM task | How hard the model thinks before answering; cost per call |
| [`rubric-weights.json`](rubric-weights.json) | Per-rubric scoring weights for the evaluator | Weighted overall score in every eval run |
| [`evaluation-thresholds.json`](evaluation-thresholds.json) | Score thresholds that trigger revision rounds; max revision cap | How aggressively the agentic loop retries a poor result |
| [`browser-eval-scoring.json`](browser-eval-scoring.json) | Playwright + VM QA scoring cutoffs | How browser-eval grades interactive elements, content density, and rendering quality |
| [`completion-budget.json`](completion-budget.json) | Per-purpose token margins (incubate / compaction / agent_turn / default) | How many completion tokens are reserved before the context window is considered full |
| [`content-limits.json`](content-limits.json) | Truncation caps for sandbox tools, evaluator inputs, traces, and logs | What gets cut off in tool output, eval prompts, and observability NDJSON |

---

## `feature-flags.json`

Two product-level switches. Use `1` to enable, `0` to disable, or `"auto"` to enable only in production builds.

| Flag | Default | What it controls |
|---|---|---|
| `lockdown` | `"auto"` | When on, all LLM routes clamp to the per-task provider/model pins in `task-defaults.json`. No provider/model selection in the UI. When off, users can pick any provider and model per task. |
| `autoImprove` | `0` | When on, the evaluator-driven revision loop (Auto-improve) is exposed on hypothesis nodes and in Settings. When off, that UI is hidden and designs are always single-pass. |

Both flags are read at server boot (Zod-validated). `"auto"` resolves to on in production and off in development. Changes take effect on the next app start.

These flags do not control canvas node availability. The retired Existing Design node is not configurable, and the Design System node is canonical and always available. `thinking-defaults.json` controls the Design System extraction model budget only; it does not toggle the node.

---

## `task-defaults.json`

Provider/model defaults for each LLM task: `design`, `incubate`, `inputs`, `design-system`, and `evaluator`. Settings -> Reasoning can override them when lockdown is off; lockdown uses these task defaults as the server-enforced pins.

Legacy compatibility helpers that need one provider/model pair derive from the `incubate` task default. Do not add a second provider/model defaults file; this file is the canonical source.

## `openrouter-routing.json`

OpenRouter provider-routing overrides keyed by model id. Use this when a specific OpenRouter model must be routed to a specific provider endpoint. Code validates this file in `server/lib/openrouter-provider-routing.ts` and forwards matching entries as the OpenRouter `provider` request object.

---

## `thinking-defaults.json`

Thinking-level and per-call token-budget defaults sent to LLM providers, broken down by task. Two knobs per task:

- **`level`** — how hard the model should think. Maps to `reasoning.effort` (OpenRouter), `thinking.budget_tokens` (Anthropic), or `reasoning_effort` (OpenAI).
- **`budgetTokens`** — max tokens of private reasoning before the final answer. Caps spend per call.

Both apply only when the chosen model **supports reasoning**. The capability gate lives in `src/lib/model-capabilities.ts`; the patterns it matches today are: OpenAI `o1`–`o9`, `claude-3.5` / `claude-3.7` / `claude-4`, `deepseek-r1`, `deepseek-reasoner`, `minimax-m2.7`, `qwq`, `qwen3`, and any model id ending in `-thinking`. Non-reasoning models (e.g. the default `deepseek/deepseek-v4.1-flash`) ignore these — the resolver returns `{ level: 'off', budgetTokens: 0 }` regardless of what's in this file.

### Level ladder (`budgetByLevel`)

| Level | Suggested budget | When to use |
|---|---|---|
| `off` | 0 | No extended reasoning. |
| `minimal` | 1024 | Format correctness matters; deep planning doesn't. |
| `low` | 2048 | Structured extraction. |
| `medium` | 5000 | Balanced default for lighter node tasks. |
| `high` | 20000 | Long deliberation — default for core design and synthesis tasks. |
| `xhigh` | 32768 | Maximum effort. Use sparingly. |

`budgetByLevel` is the budget ladder used when Settings → Reasoning sends a level override. The UI exposes levels only; it does not expose a separate budget field.

### Task slots (`perTaskDefaults`)

| Task | When it runs | Default |
|---|---|---|
| `design` | Agentic build pipeline (hypothesis → generate → evaluate) | high / 20000 |
| `incubate` | `/api/incubate` and hypothesis auto-generation | high / 20000 |
| `inputs` | `/api/inputs/generate` (spec facets from a brief) | medium / 5000 |
| `design-system` | `/api/design-system/extract` (text/Markdown/images → DESIGN.md) | high / 20000 |
| `evaluator` | Per-rubric eval workers (design, strategy, implementation, browser) | low / 2048 |

### Budget bounds

`budgetBounds.minTokens` = **1024** (Anthropic extended-thinking API floor — values below are clamped up).
`budgetBounds.maxTokens` = **32768** (internal ceiling — values above are clamped down). Revisit when providers raise their limits.

### Runtime overrides

Per-user runtime overrides come from Settings → Reasoning (persisted in Zustand, scoped per user). This file is the **fallback baseline** that applies when no override is set.

---

## `rubric-weights.json`

Four rubric weights that must sum to 1.0 (the loader normalizes if they don't, but keeping them summed to 1 is good practice):

| Key | Rubric | Default |
|---|---|---|
| `design` | Visual design quality | 0.4 |
| `strategy` | Hypothesis alignment | 0.3 |
| `implementation` | Code quality | 0.2 |
| `browser` | Rendered QA | 0.1 |

Changing these shifts the `overallScore` that appears in eval runs and drives the revision gate.

---

## `evaluation-thresholds.json`

Controls when the agentic loop decides to revise:

| Key | Meaning | Default |
|---|---|---|
| `revisionGate.criticalScoreMax` | Score at or below this on any **design or strategy** criterion triggers revision | 2 |
| `revisionGate.implCriticalScoreMax` | Score at or below this on any **implementation or browser** criterion triggers revision (looser; code hygiene issues don't always warrant a full revision) | 1 |
| `revisionGate.lowAverageThreshold` | Weighted overall score below this triggers revision when no individual criterion is critical | 3.5 |
| `maxRevisionRoundsCap` | Hard cap on how many revision rounds the orchestrator will run (regardless of scores) | 20 |

Raising thresholds → more revision rounds, higher quality, more cost. Lowering them → fewer rounds, faster runs.

---

## `browser-eval-scoring.json`

Two groups of thresholds:

**`playwright.*`** — thresholds evaluated against the live Chromium render:
- `consoleErrors` — how many JS console errors map to each score level (score5 = 0 errors, score3 = 1, score2 = 2, bulkPenalty applied at 3+)
- `visibleText` — minimum visible character counts for excellent / good / minimal text scores
- `bodyLayout` — minimum rendered body width/height to get a "strong" layout score
- `screenshotJpegQuality` — JPEG quality for the viewport capture stored in the browser QA report (1–100)

**`qa.interactive.*`** — structural HTML element counts required to reach each score tier (total interactive elements, anchors, buttons, forms, nav elements)

**`qa.content.*`** — word counts and heading/paragraph/section counts required for each content score tier

---

## `completion-budget.json`

Token reserves subtracted from `context_window − prompt` before setting `max_tokens`:

| Key | When used |
|---|---|
| `margins.incubate` | `/api/incubate` — single structured JSON response |
| `margins.compaction` | Conversation compaction — moderate-length summaries |
| `margins.agentTurn` | Pi agent turns — long transcript + tool definitions in context |
| `margins.default` | All other completions |
| `minCompletion` | Minimum budget returned; if the window is tighter than this, `max_tokens` is omitted entirely |
| `absoluteCeiling` | Hard cap regardless of context window size |

Raising a margin → more conservative requests, less risk of hitting the window mid-response. Lowering it → tighter calls, slightly more output before truncation.

---

## `content-limits.json`

Truncation caps used across server code. Four groups:

**`sandbox.*`** — limits on virtual tool output (grep line length, ls/find result counts, bash output)

**`evaluator.*`** — limits on what the LLM evaluator sees (per-file chars, bundle HTML, error message length, compiled prompt in revision messages). Named `evaluator` rather than `eval` because `eval` is a reserved identifier in strict-mode ESM and breaks JSON-as-module imports under tsx/esbuild.

**`trace.*`** — how much is written per field in observability NDJSON (tool args, tool results, labels)

**`log.*`** — preview snippet lengths in server logs (short bash command previews, trace snippets)

---

## What you can't do here

- **Add new rubric keys** (`rubric-weights.json`) — rubric IDs are an enum in `src/types/evaluation.ts`. Adding one requires a code change.
- **Add new completion purposes** (`completion-budget.json`) — `CompletionPurpose` is a union type in `server/lib/completion-budget.ts`.
- **Add new thinking levels or tasks** (`thinking-defaults.json`) — the level enum and task list are defined in `src/lib/thinking-defaults.ts` alongside Pi's SDK types. New tasks also need wiring into request schemas and call sites.
- **Disable Zod validation** — the loaders validate at boot. A bad value fails fast with a readable path error rather than silently degrading at runtime.

---

## What's NOT in here (and why)

Some settings belong in `.env.local` (gitignored) rather than `config/`:

- **Secrets** — `OPENROUTER_API_KEY`. JSON is checked into git.
- **Environment-specific values** — `PORT`, `VITE_PORT`, `LMSTUDIO_URL`. Each developer's machine / deploy target differs.
