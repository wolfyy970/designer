# Meta-Harness outer loop — CLI runbook

How to **run and operate** the `pnpm meta-harness` CLI: the standalone **outer optimization loop** inspired by [Meta-Harness](https://arxiv.org/abs/2603.28052). One **proposer** model (with filesystem tools) proposes harness changes; a **runner** measures them by calling your API and reading `**eval-runs/`** on disk.

This is **not** the main web app—it is a script that talks to `**pnpm dev:server`** and can edit repo files (especially `**skills/**`) when the proposer runs.

---

## 1. Prerequisites


| Requirement                 | Why                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Node / pnpm**             | Same as the rest of the repo.                                                                                                                                                                                                                                                                                                        |
| **API up**                  | `pnpm dev:server` or `pnpm dev:all` so `http://127.0.0.1:3001/api/health` works (or change `apiBaseUrl` in `config.json`).                                                                                                                                                                                                           |
| `**OPENROUTER_API_KEY`**    | In `.env.local` or the environment. Used by **hypothesis generation** and by the **proposer** (separate OpenRouter calls).                                                                                                                                                                                                           |
| `**eval-runs/` visibility** | After each agentic run, the server writes structured logs under `{log-base}/eval-runs/<run-id>/`. In **development**, if you do not set `OBSERVABILITY_LOG_DIR` / `LLM_LOG_DIR`, the server defaults to `**logs/observability`**. The runner resolves the same base dir unless you override it in `config.json` → `evalRunsBaseDir`. |


---

## 2. Configuration: files vs command line vs environment

**Summary:** The CLI uses **both** a JSON config file and a few **flags**. There is **no** `pnpm meta-harness --config /path/...` option today—the runner always reads `**meta-harness/config.json`** at the repo root (next to `package.json`). **Benchmark “tasks”** are separate JSON files under `**meta-harness/test-cases/`**.


| Source                                    | What it controls                                                                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**meta-harness/config.json**` (required) | API URL, iteration count, proposer model + tool budget, provider defaults, optional inner revision cap, optional `evalRunsBaseDir`.                                                                            |
| **Command line**                          | `**--mode**`, `**--dry-run**`, `**--eval-only**`, `**--once**`, `**--plain**`, `**--test=**` (see §3). Everything else comes from `config.json` or env.                                                                         |
| `**.env.local` / `.env**`                 | `OPENROUTER_API_KEY` (and the server’s keys when you run `dev:server`). Optional `OBSERVABILITY_LOG_DIR` / `LLM_LOG_DIR` so `**eval-runs/**` land where the runner expects (unless you set `evalRunsBaseDir`). |
| `**meta-harness/test-cases/*.json**`      | Each file is one scenario: **`spec` + `model`** always; **`strategy`** required for default **`--mode=design`**; optional for **`compile`** / **`e2e`** (hypotheses come from `POST /api/compile`). See §3.1.   |


### 2.1 `config.json` fields


| Field                      | Meaning                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                     | Default mode: `compile`, `e2e`, or `design`. Overridden by `--mode` on the CLI. Falls back to `design` if omitted.                      |
| `apiBaseUrl`               | Origin + `/api` prefix, e.g. `http://127.0.0.1:3001/api`.                                                                                                                              |
| `evalRunsBaseDir`          | Optional. Absolute path or path relative to repo root. If empty, the runner uses `OBSERVABILITY_LOG_DIR` → `LLM_LOG_DIR` → `logs/observability` (aligned with server defaults in dev). |
| `iterations`               | How many **candidate** loops to run (each loop: optional proposer → evaluate all test cases). Overridden for that run if you pass `**--once`** (forces **1** iteration).               |
| `proposerModel`            | OpenRouter model id for the proposer (tool-calling).                                                                                                                                   |
| `proposerMaxToolRounds`    | Max assistant/tool rounds per proposer turn (safety cap).                                                                                                                              |
| `defaultCompilerProvider`  | Passed through on hydrated payloads (e.g. `openrouter`).                                                                                                                               |
| `supportsVision`           | Optional; forwarded to generate if set.                                                                                                                                                |
| `agenticMaxRevisionRounds` | Optional cap for inner revision rounds per generation.                                                                                                                                 |
| `compileProvider`          | Provider id for **`POST /api/compile`**. Defaults to `defaultCompilerProvider` if omitted.                                                                                              |
| `compileModel`             | Model id for compile. Defaults to `minimax/minimax-m2.5` if omitted.                                                                                                                     |
| `hypothesisEvalModel`      | OpenRouter model for **compile-mode** hypothesis rubric (six 1–5 scores). If empty, **`proposerModel`** is used.                                                                        |
| `compileHypothesisCount`   | Default `promptOptions.count` when a test case omits **`compile.hypothesisCount`**. Default **5**.                                                                                     |


### 2.2 Example `config.json` snippets

**Default-style local dev** (matches the file shipped in the repo — ready to run immediately):

```json
{
  "mode": "compile",
  "apiBaseUrl": "http://127.0.0.1:3001/api",
  "evalRunsBaseDir": "",
  "iterations": 1,
  "proposerModel": "anthropic/claude-sonnet-4",
  "proposerMaxToolRounds": 24,
  "defaultCompilerProvider": "openrouter",
  "compileProvider": "openrouter",
  "compileModel": "minimax/minimax-m2.5",
  "hypothesisEvalModel": "",
  "compileHypothesisCount": 5,
  "designGenerationModel": "minimax/minimax-m2.5",
  "supportsVision": false,
  "agenticMaxRevisionRounds": 3
}
```

Key points about the defaults:

- `**iterations: 1**` — safe to start with; you see results from one candidate before committing to a long search. Increase once you trust the setup.
- `**agenticMaxRevisionRounds: 3**` — keeps each test case fast (~1-2 min). Raise to 5 if you want deeper inner revision.
- `**evalRunsBaseDir: ""**` — resolves to the server's dev default (`logs/observability`), so config + server agree out of the box.

**Longer search, cheaper inner loop** (bump iterations, limit inner revision):

```json
{
  "$comment": "overnight run — 10 candidates, fast evals",
  "apiBaseUrl": "http://127.0.0.1:3001/api",
  "evalRunsBaseDir": "",
  "iterations": 10,
  "proposerModel": "anthropic/claude-sonnet-4",
  "proposerMaxToolRounds": 24,
  "defaultCompilerProvider": "openrouter",
  "agenticMaxRevisionRounds": 2
}
```

**Explicit log directory** (runner + server must agree—simplest is the same path for both):

```json
{
  "apiBaseUrl": "http://127.0.0.1:3001/api",
  "evalRunsBaseDir": "/tmp/auto-designer-observability",
  "iterations": 1,
  "proposerModel": "anthropic/claude-3.5-sonnet",
  "proposerMaxToolRounds": 20,
  "defaultCompilerProvider": "openrouter"
}
```

Use that last form when you set `OBSERVABILITY_LOG_DIR=/tmp/auto-designer-observability` on `**pnpm dev:server**` as well.

---

## 3. Commands (from repo root)

The script loads `**.env.local**` then `**.env**` before reading `**config.json**`.

**Flags:** there are no positional arguments, no `--model`, no `--url` on the CLI—change those in `**config.json`**. In an interactive terminal the runner opens an **Ink** dashboard; use `**--plain**` or redirect/pipe stdout to get classic line-by-line logs (CI, `tee`, etc.).

### 3.1 Modes (`--mode`)

| Mode | Behavior | Proposer focuses on |
|------|----------|---------------------|
| **`design`** (default) | Fixed **`strategy`** from each test case → **`POST /api/hypothesis/generate`** (agentic + eval). | Designer prompts, **`skills/`**, evaluators, benchmarks. |
| **`compile`** | **`POST /api/compile`** from spec → OpenRouter **hypothesis rubric** per hypothesis (no design build). Mean rubric score = fitness. | **`hypotheses-generator-system`**, **`incubator-user-inputs`** only (no skills). |
| **`e2e`** | Compile → **random** hypothesis → same agentic generate + eval as design mode. | Full pipeline: compile prompts, designer prompts, skills, evaluators. |

**Recommended workflow:** run **`compile`** for many iterations (cheap), then **`e2e`** for holistic tuning. Spec-only benchmarks (no `strategy`) are **skipped** in **`design`** mode—use them with **`compile`** / **`e2e`**, or split test folders.

Set the default in **`config.json`** → **`"mode"`** so you don't have to type the flag every time. The CLI flag **`--mode=X`** overrides whatever is in config. If neither is set, defaults to `design`.

```bash
pnpm meta-harness --mode=compile
pnpm meta-harness --mode=e2e
```

**`--eval-only`:** No proposer. In **`compile`** mode you still need **`OPENROUTER_API_KEY`** for the hypothesis rubric. In **`design`** / **`e2e`**, generations use the server; rubric calls do not apply.

```bash
# Dry-run: first sorted test case after any `--test=` filters. For compile/e2e → POST /api/compile JSON; for design → hypothesis generate JSON.
pnpm meta-harness --dry-run

# Run only benchmarks whose JSON filename (without .json) contains a substring; repeat for OR match.
pnpm meta-harness --test=dashboard-analytics --once

# Evaluate only: no proposer. Design/e2e still run agentic generations via the API (keys per server).
# Compile + eval-only still requires OPENROUTER_API_KEY for the rubric.
pnpm meta-harness --eval-only

# Single candidate cycle (proposer once + all test cases), then stop.
pnpm meta-harness --once

# Full run: proposer + evaluate, repeated `iterations` times from config.json.
pnpm meta-harness

# Force plain console output (no Ink TUI) even in a TTY.
pnpm meta-harness --plain
```

**Flag reference**


| Flag          | Effect                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `--mode`      | `compile` / `e2e` / `design`. Overrides `mode` in `config.json`. See §3.1.                                                               |
| `--dry-run`   | Validates hydration + prints JSON; exits. Mode-aware: compile/e2e → compile body; design → generate body.                                |
| `--test=`     | Keep only test cases whose basename (no `.json`) contains the substring (case-insensitive). Multiple flags are **OR**’d. Errors if none match. |
| `--eval-only` | Skips OpenRouter **proposer**; `prompt-overrides.json` for that candidate is `{}`. **`compile`** still needs **`OPENROUTER_API_KEY`** for the rubric. **`design`** / **`e2e`** use the API for generation (keys per server lockdown). Skips the automatic **baseline** pass (see §4)—every iteration is eval-only. |
| `--once`      | Sets iteration count to **1** for this invocation (ignores `iterations` in `config.json` for that run).                                 |
| `--plain`     | Use line-based `console` output only (no Ink TUI).                                                                                      |


### 3.2 Example command combinations

**Smoke-test the harness payload (no server needed):**

```bash
pnpm meta-harness --dry-run
```

**One full outer iteration without burning `iterations` from config** (good for debugging):

```bash
pnpm meta-harness --once
```

**Measure current `skills/` + repo prompts only—no proposer editing the harness first:**

```bash
pnpm meta-harness --eval-only --once
```

**Typical overnight search** (many candidates): set `"iterations": 10` (or higher) in `config.json`, ensure API is up, then:

```bash
pnpm meta-harness
```

**Lay terms:** think of `**config.json`** as the “knobs panel,” **flags** as short overrides (`--once`, `--eval-only`, `--dry-run`, `--plain`), and `**.env.local`** as where your API key lives.

---

## 4. What one iteration does

The exact evaluate step depends on the mode you chose (section 3.1). Here is the full sequence:

0. **New session directory**: Each run creates **`meta-harness/history/session-<ISO-timestamp>/`** with a **`session.json`** (mode, iterations, config snapshot). All candidates for that run live under that folder only — prior runs stay in sibling **`session-*`** folders (gitignored), so the proposer never confuses another run’s **`candidate-*`** with this one.
1. **Baseline `candidate-0`** (when not `--eval-only`): Evaluates the **current repo** (empty prompt overrides, current `skills/`) as **`candidate-0 (baseline)`** inside the **new session directory** before any proposer runs. Baseline **always** runs for a new session (no resume skip across runs). Baseline does **not** count against **`iterations`** in `config.json`.
2. **Proposer** (skipped if `--eval-only`): Calls OpenRouter with a mode-specific system prompt and tools. In compile mode, skills tools are disabled and only compile-related prompt keys are writable. Context includes **this session’s** prior **`candidate-*`** (scores, overrides, per-test **`summary.json`** rubric means, **`proposal.md`** excerpt) plus a **reference table** of prior sessions’ best scores from **`best-candidate.json`**. It may **write** `skills/<key>/SKILL.md`, **queue** `promptOverrides` for this candidate only, or **add** `meta-harness/test-cases/*.json`. It should finish with **`submit_candidate`** and a short **reasoning** written to **`session-…/candidate-N/proposal.md`**. If it **runs out of tool rounds** without calling **`submit_candidate`** but **did** queue prompt overrides or edit skills, those changes are **still applied** for that candidate with an auto-reason string; if it made **no** changes, the reasoning explains that (suggest checking history / tool budget).
3. **Snapshot**: Copies the current **`skills/`** tree to **`session-…/candidate-N/skills-snapshot/`**.
4. **Evaluate**: For each selected test-case JSON (all under `**test-cases/**`, or the subset matched by **`--test=`**), behavior is mode-dependent. In design mode, hydrates each test case into a full `**/api/hypothesis/generate**` payload (agentic), attaches this candidate’s **prompt overrides**, streams SSE until done, then waits for `**eval-runs/<correlation-id>:lane-0/meta.json`** . In compile mode, calls POST /api/compile per test case and runs an OpenRouter LLM rubric on each hypothesis (no design build). In e2e mode, calls compile, randomly picks one hypothesis, then generates and evaluates like design mode.
5. **Scores**: Writes per-test `**test-results/<case>/summary.json`** (includes **`rubricMeans`** for agentic runs when available) and `**aggregate.json**` (mean overall score). Updates **`session-…/best-candidate.json**` when the mean improves.
6. **Changelog**: Writes `**CHANGELOG.md`** inside the candidate folder, summarizing what changed, prompt overrides applied, and a per-test score table (see §5.1).
7. **Promotion report** (end of the full run): Writes **`session-…/PROMOTION_REPORT.md`** at the **session root** (alongside `session.json` / `best-candidate.json`). The report still names the winning `candidate-*` folder and prints a short summary in the terminal (Ink summary panel or `--plain` logs). This is the **manual apply guide**: prompt bodies, skill snapshot vs current `skills/`, new test cases, and a checklist (see §5.2).

**Important:** Skills edits from the proposer are **real files** in the repo. Use git if you want to revert. Prompt overrides from the proposer are **not** saved to Langfuse; they live in `**history/.../prompt-overrides.json`** and are only sent on API requests for that candidate.

### 4.1 Preflight checks

Before any candidate runs, the CLI:

- Verifies `**/api/health**` is reachable (fails fast if server is down).
- Lists test case files (exits if the folder is empty).
- Checks `**OPENROUTER_API_KEY**` if the proposer is needed.

### 4.2 What you see in the terminal

The runner prints a **startup banner** with your settings (iterations, test cases, API URL, proposer model, revision cap), then per-candidate:

```
──── Proposer (anthropic/claude-sonnet-4) ──────────────────────
  [proposer round 1] list_dir meta-harness/history
  [proposer round 1] read_file skills/design-quality/SKILL.md
  [proposer round 2] write_skill typography-scale
  [proposer round 3] submit_candidate Rewrote spacing guidance…
  proposer done (14.2s)
  prompt overrides: designer-agentic-system
  reasoning: Rewrote spacing guidance in a new typography-scale…

──── Test 1/3: landing-page-saas ───────────────────────────────
  phase: building
  phase: evaluating
  eval round 1: score=3.45 → revising
  revision round 2 starting…
  eval round 2: score=3.82
  landing-page-saas done (48.3s) score=3.82 stop=satisfied

──── Test 2/3: dashboard-analytics ─────────────────────────────
  …

──── Results: candidate-1 (loop 1/3) ───────────────────────────
  mean score   3.67
  best so far  candidate-1 (3.67)
  ** new best **
  changelog    meta-harness/history/session-…/candidate-1/CHANGELOG.md
```

**Lay terms:** you can watch the proposer browsing files and making edits in real time; then each test case shows phases, eval scores, and whether it triggered revisions — so you see if things are getting better or worse before the full run finishes.

### 4.3 Ink terminal UI (default in a TTY)

When stdout is a TTY and you do **not** pass `--plain`, the runner renders a React **Ink** dashboard: header with timer, proposer tool trace, per-test rows with live SSE-derived status, scoreboard, activity log, and **`q`** to request stop after the current step / **`d`** to toggle raw SSE detail lines. Artifacts are still written under `meta-harness/history/` as before.

---

## 5. Files and folders


| Path                    | Role                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.json`           | CLI settings.                                                                                                                                         |
| `test-cases/*.json`     | **Simplified** benchmarks (`spec` + `model`; `strategy` optional for compile/e2e). See `test-case-hydrator.ts`.                                      |
| `history/session-…/`    | **Gitignored.** Per-run folder: **`session.json`**, **`best-candidate.json`**, **`PROMOTION_REPORT.md`** (after a full run, when there is a best candidate), and **`candidate-0`**, **`candidate-1`**, … (per-candidate proposals, overrides, skills snapshot, test results, aggregates, changelog). |
| `runner.tsx`            | CLI entry (Ink vs plain).                                                                                                                             |
| `runner-core.ts`       | Outer-loop engine; `RunnerCallbacks` only (no UI).                                                                                                     |
| `ui/`                   | Ink app (`App.tsx`, panels, reducer state).                                                                                                            |
| `proposer.ts`           | OpenRouter tool loop; **mode-aware** prompts and tools (`compile` disables skills).                                                                   |
| `modes.ts`              | Shared `MetaHarnessMode` type.                                                                                                                        |
| `hypothesis-evaluator.ts` | OpenRouter **compile-mode** rubric (six 1–5 dimensions per hypothesis).                                                                           |
| `evaluator.ts`          | SSE + `eval-runs` wait (design / e2e generate path).                                                                                                  |
| `test-case-hydrator.ts` | Simplified JSON → compile body or `HypothesisGenerateRequestSchema`.                                                                                  |
| `promotion-report.ts`   | Builds `PROMOTION_REPORT.md` + `PromotionSummary` (prompt / skill / test-case deltas + checklist).                                                  |


Server-side structured logs (prompts, raw evaluator traces, round files) live under:

`{evalRunsBaseDir}/eval-runs/<lane-correlation-id>/`

The lane id is `<your correlationId>:lane-0` for the default single-lane setup.

### 5.1 Per-candidate CHANGELOG.md

After each candidate finishes, the runner writes **`history/session-…/candidate-N/CHANGELOG.md`**. Example:

```markdown
# candidate-3

**Iteration:** 3 / 5
**Mean score:** 3.91 (3 test cases)

## What the proposer changed

Added a typography-scale skill with explicit spacing rhythm rules
and line-height guidance. Overrode designer-agentic-system to add
a self-critique step before final output.

## Prompt overrides applied

- `designer-agentic-system`

## Per-test results

| Test case | Score | Stop reason |
|-----------|-------|-------------|
| dashboard-analytics | 3.85 | satisfied |
| landing-page-saas | 4.02 | satisfied |
| onboarding-checklist | 3.87 | max_revisions |
```

**This answers "what changed and why"** in a human-readable file you can skim without digging into JSON or raw eval traces. The `proposal.md` alongside it has the proposer's full reasoning; `prompt-overrides.json` has the exact overrides; `skills-snapshot/` has the skills that were active.

### 5.2 `PROMOTION_REPORT.md` (manual promotion)

After **all** iterations finish, the runner writes **`meta-harness/history/session-…/PROMOTION_REPORT.md`** at the session root (only when there is a winning candidate id). The body still identifies **`candidate-<best>`** and paths under that folder for applying changes.

Open that file for:

| Section | What you get |
|--------|----------------|
| **1. Result summary** | Winning candidate, mean score, mode, and a table of every candidate’s mean score |
| **2. Prompt overrides** | Full text for each overridden key → paste into `src/lib/prompts/shared-defaults.ts` (`PROMPT_DEFAULTS`) |
| **3. Skill changes** | Diff of **`skills-snapshot/`** (winner) vs **`skills/`** in the repo **after** the run — modified paths with byte sizes; files only on one side |
| **4. New test cases** | Test-case JSON names that appeared under `meta-harness/test-cases/` since the run **started** |
| **5. How to apply** | Numbered checklist: edit defaults → `pnpm langfuse:sync-prompts` (if you use Langfuse) → sync skills from snapshot → `pnpm test` / `pnpm lint` |
| **6. Proposer reasoning** | Copy of `proposal.md` |

**Lay terms:** the harness experiments on a copy of your prompts and skills in memory and on disk, but **nothing is pushed to Langfuse** automatically. This report is your “ship list” so you can promote the winner into the real app by hand.

The terminal also shows a **short line count** (how many prompts / skill paths / new tests) so you know whether to open the report before you leave the desk.

---

## 6. Adding or changing benchmark tasks

1. Copy an existing file under `**test-cases/`**.
2. Keep the required shape: `name`, `spec.title`, `spec.sections` (map of section id → string or `{ "content": "..." }`), `model` (`providerId`, `modelId`, optional `thinkingLevel`).
   - **For `--mode=design`:** also include `strategy` (`id`, `name`, `hypothesis`, `rationale`, `measurements`, `dimensionValues`). Test cases **without** `strategy` are skipped in design mode.
   - **For `--mode=compile` / `--mode=e2e`:** `strategy` is **optional** (hypotheses come from the compile endpoint). Add an optional `compile` block: `{ "hypothesisCount": 5 }` to control how many hypotheses are requested.
3. Run `**pnpm meta-harness --dry-run --mode=<your-mode>**` to ensure hydration passes.

The proposer may also call `**add_test_case**`; new files must still pass `**SimplifiedMetaHarnessTestCaseSchema**`.

---

## 7. Optional live integration test

With the API running and keys available:

```bash
META_HARNESS_LIVE=1 pnpm vitest run meta-harness/__tests__/runner-live.test.ts
```

This performs one real agentic generation and asserts `**eval-runs/.../meta.json**` exists. It is **slow** and **costs tokens**; default CI does not set `META_HARNESS_LIVE`.

---

## 8. Troubleshooting


| Symptom                        | What to check                                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Set OPENROUTER_API_KEY`       | Key missing for proposer or for generation (even `--eval-only` needs generation).                                                                        |
| `HTTP 4xx/5xx` from generate   | Server logs; body too large; lockdown model rules; missing credentials on server.                                                                        |
| `evalRunDir` null / timeout    | Log base mismatch: server wrote under `**logs/observability`** but runner points elsewhere—set `**evalRunsBaseDir**` in `config.json` or align env vars. |
| Proposer makes bad skill edits | Lower `**proposerMaxToolRounds**`, use a stronger `**proposerModel**`, or run `**--eval-only**` while you hand-edit `**skills/**`.                       |
| No `history/` in git           | `**meta-harness/history/**` is in `**.gitignore**` by design; copy artifacts out if you need to share them.                                              |


---

## 9. Relation to the main app

- **Does not** replace the canvas or change the server code path—only **calls** `POST /api/compile` and `POST /api/hypothesis/generate` like the UI does.
- **Does** implement the paper’s “outer loop” **shape**: filesystem history + proposer + repeated evaluate. Full automation quality depends on models, budget, and benchmarks—same as in the paper’s experiments.

---

## 10. Best use recommendations (from the paper)

These follow [Meta-Harness](https://arxiv.org/abs/2603.28052) (Lee et al., 2026): an outer loop stores **full** artifacts on disk, a **proposer** reads them **selectively** (not as one compressed summary), and evaluation uses **tasks** that represent what you actually want to improve.

### Preserve diagnostic depth, not just scores

The paper argues that common optimizers fail at harness engineering because they **compress feedback** too much: memoryless updates, **scalar scores only**, or short LLM summaries. Their loop instead keeps **source, scores, and execution traces** for every candidate. In their ablations, access to **full traces** dominates weaker feedback regimes.

**Here:** Keep server `**eval-runs/`** logging enabled and aligned with the runner’s `**evalRunsBaseDir**`. When reviewing or prompting the proposer, prioritize `**round-*/*.raw.txt**` (evaluator reasoning + JSON) and `**aggregate.json**`, not only `**meta.json**`’s final score. The inner app’s revision agent already benefits from traces; the outer loop should too.

### Treat the filesystem as the long-term memory

The proposer is designed to `**grep` / read** many small files across **all prior candidates** instead of ingesting history as a single prompt. In their reported runs, the agent touches many files per iteration because **total experience exceeds context limits**—**adaptive browsing** matters.

**Here:** Old sessions accumulate under `**meta-harness/history/session-*/**` (gitignored). Each new run gets a **new** `**session-*`** folder; the proposer only learns from **the current session’s** `**candidate-***` plus a compact **prior-sessions best** table. You can delete old `**session-*`** folders to save disk; that only removes historical reference for future runs.

### Fix the benchmark tasks before chasing the harness

Their Figure 2 step (2) is **evaluate on tasks**. If tasks are noisy, biased, or unrelated to product goals, the outer loop optimizes the wrong signal.

**Here:** Invest in `**test-cases/*.json`** that mirror real specs and hypotheses you care about. Add coverage across layout types (e.g. marketing page vs dense dashboard). Prefer a **stable** suite when comparing candidates; only expand when you want the loop to optimize for new scenarios.

### One causal hypothesis per candidate (early on)

The paper frames **credit assignment at the harness level**: link failures back to **which harness choice** (prompt, retrieval, presentation) likely caused them. Harness effects are **long-horizon**—one bad instruction can show up many steps later—so muddy multi-edit candidates make learning harder.

**Here:** Early in a search, encourage the proposer (via your instructions or manual runs) to make **small, testable edits**: one skill, or one prompt override, or one evaluation-facing tweak—then re-measure on the full suite. Widen the search space once you see clear score movement.

### Use a proposer that can use tools well

They use a **coding agent**, not a single-shot chat completion, because the proposer must **choose what to inspect** and **apply patches** against a growing tree of logs.

**Here:** Set `**proposerModel`** to a model that is reliably strong at **tool calling** and long-horizon reasoning. Give enough `**proposerMaxToolRounds`** for read → diagnose → edit → `**submit_candidate**`, but cap it to limit runaway cost (see troubleshooting).

### What to avoid (paper’s implied “anti-patterns”)


| Avoid                                                                     | Why (paper)                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Optimizing from **mean score alone** with no traces                       | Loses the linkage from failure to harness decision.          |
| **Replacing** raw logs with human summaries before the proposer sees them | Summaries drop the detail their method relies on.            |
| **Deleting** prior candidate directories                                  | Breaks non-Markovian comparison across iterations.           |
| Huge unrelated **promptOverrides** bundles per candidate                  | Harder credit assignment; measure drift vs. your benchmarks. |


**In plain terms:** the paper’s recipe is “**save everything important on disk, let the next iteration read the real evidence, and evaluate on honest tasks**.” Your CLI is closest to that when `**eval-runs/`** and `**history/**` stay rich, stable, and actually consulted—not when you chase a single number with a wiped folder each time.

---

For a short overview, see `**README.md**` in this folder.