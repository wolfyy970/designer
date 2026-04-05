# Meta-Harness outer loop

Standalone CLI inspired by [Meta-Harness](https://arxiv.org/abs/2603.28052): a **proposer** agent edits skills, prompt overrides, and benchmark JSON; a **runner** scores each candidate. **`--mode=design`** (default) runs fixed strategies through **`POST /api/hypothesis/generate`**. **`--mode=compile`** runs **`POST /api/compile`** plus an OpenRouter **hypothesis rubric** (no design build). **`--mode=e2e`** compiles, picks a **random** hypothesis, then generates and evaluates like design mode.

**Operator runbook:** [META_HARNESS_OUTER_LOOP.md](./META_HARNESS_OUTER_LOOP.md) — how to run `pnpm meta-harness`, config, flags, folders, benchmarks, troubleshooting.

## Prerequisites

1. **API server running** (`pnpm dev:server` or `pnpm dev:all`).
2. **`OPENROUTER_API_KEY`** in `.env.local` (or env) for the **proposer**, for **`--mode=compile`** rubric calls, and for generation when using OpenRouter-backed models on the server.
3. Optional: set **`OBSERVABILITY_LOG_DIR`** or rely on dev default `logs/observability` so `eval-runs/<id>/` exists after agentic runs.

## Usage

```bash
# From repo root; loads .env.local via dotenv in runner
pnpm meta-harness

# One full iteration (propose + evaluate all test cases), then exit
pnpm meta-harness --once

# Skip proposer (evaluate current repo state only; no LLM proposer call)
pnpm meta-harness --eval-only

# Only run benchmarks whose JSON basename contains a substring (multiple --test= OR’d)
pnpm meta-harness --test=dashboard-analytics --once

# Dry run: show hydrated payload + paths, no HTTP (compile body if --mode=compile|e2e)
pnpm meta-harness --dry-run
pnpm meta-harness --mode=compile --dry-run

# Hypothesis-quality loop (compile + rubric only)
pnpm meta-harness --mode=compile

# Full pipeline: compile → random hypothesis → build + eval
pnpm meta-harness --mode=e2e

# Classic log lines (no Ink dashboard) — useful for CI or piping to a file
pnpm meta-harness --plain
```

In a normal terminal, the runner uses an **Ink** (React-in-terminal) UI; `--plain` keeps the previous `console.log` behavior.

## Layout

- `config.json` — mode (`compile` / `e2e` / `design`), API URL, proposer model, iteration budget. The `--mode` CLI flag overrides the config value.
- `test-cases/*.json` — benchmarks: **`spec` + `model`** always; **`strategy`** required for **`--mode=design`**; optional for **`compile`** / **`e2e`**. Optional **`compile.hypothesisCount`** sets compile output size (defaults in `config.json`). Example without strategy: `test-cases/spec-only-landing-saas.json`.
- `history/` — per-session and per-candidate artifacts (gitignored). Each run creates **`history/session-…/`** with `session.json`, `best-candidate.json`, and **`PROMOTION_REPORT.md`** at the session root after a full run (it names the winning `candidate-*` inside that session). Under the session folder, each **`candidate-*`** holds `proposal.md`, `prompt-overrides.json`, `skills-snapshot/`, `test-results/`, `aggregate.json`, etc. When **`history/candidate-0/aggregate.json`** is missing (not `--eval-only`), the runner evaluates **`candidate-0`** as a **baseline** first—even if other `candidate-*` folders exist from an old run—then runs the configured **`iterations`** of propose+eval. If the proposer exhausts its tool budget without **`submit_candidate`** but did change prompts or skills, those edits are still evaluated for that candidate.


## Live E2E (optional)

```bash
pnpm dev:server   # terminal 1
META_HARNESS_LIVE=1 pnpm vitest run meta-harness/__tests__/runner-live.test.ts
```

Requires a working API and keys; skipped when `META_HARNESS_LIVE` is unset.
