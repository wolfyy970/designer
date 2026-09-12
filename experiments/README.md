# Experiments tool

A small CLI for iterating on the Designer prompt pipeline outside the canvas. Drives the same prompt-assembly + Pi sandbox + evaluator modules the routes use, writes outputs to a structured run directory both an agent and a human can navigate.

**This is not a product surface.** It exists to let us experiment with prompt shapes and flow shapes (which stages run, in what order, with what outputs) cheaply, then promote what works back to the production pipeline.

See `~/.claude/plans/good-stuff-put-a-glistening-otter.md` for design intent.

## Quickstart

```bash
# Compose prompts without spending tokens (verifies flow shape)
pnpm exp run ideation --brief experiments/briefs/your-brief.md --dry-run

# Live run on the default flow (ideation: divergent → convergent → canonical)
pnpm exp run ideation --brief experiments/briefs/your-brief.md

# Fast path — canonical, no extra ideation stages (use when you don't need spread)
pnpm exp run canonical --brief experiments/briefs/your-brief.md

# Variant: reframe + brainstorm composition (HMW recovery, then divergent ideation)
pnpm exp run reframe-then-ideate --brief experiments/briefs/your-brief.md

# Browse runs
pnpm exp list
pnpm exp show <run-id>                    # print summary.md to stdout
pnpm exp open <run-id>                    # open run preview gallery in browser
pnpm exp open latest                      # opens the most recent run
pnpm exp diff <run-a> <run-b>
```

`pnpm exp open` opens `experiments/runs/<id>/preview.html` — a small gallery page listing every hypothesis with click-through "Open ↗" buttons to each built artifact. Auto-generates `preview.html` for runs that pre-date the feature on first open. Falls back to `summary.md` when no hypotheses exist (e.g., `inputs-gen` runs).

The CLI reads `.env.local` / `.env` the same way the server does, so `OPENROUTER_API_KEY` should already work if your dev server runs.

## Run directory layout

```
experiments/runs/<run-id>/
  config.json              # flow, brief id, models, durations, notes
  summary.md               # human + agent readable headline (incl. per-hypothesis honesty verdict)
  spec.md                  # final assembled <specification> sent to incubator
  hypotheses.json          # incubator output (parsed IncubationPlan)
  transcripts/
    01-…md                 # one transcript per LLM call (NN-honesty-<hyp> entries for stage 3.5)
    02-…md
  artifacts/<hyp-id>/      # generated static design files
  evals/<hyp-id>.json      # rubric scores per hypothesis (only when --evaluate)
  critique.md              # agent critique placeholder (filled in chat)
  feedback.md              # human response to critique
```

`summary.md` headings are stable so an agent can grep for `## Hypotheses`, `## Auto observations`, etc. The artifacts under `artifacts/<hyp-id>/index.html` open directly in a browser.

## Stages

The canonical pipeline (also the spine of `ideation` and `reframe-then-ideate`):

| Stage | What it does | Output |
|---|---|---|
| 0a (ideation flows) | Wild brainstorm (10-15 categorically different directions) | `transcripts/NN-brainstorm.md` |
| 0b (ideation flows) | Curation (product-shape filter → surface fit → spread, with audit trail in spread rationale) | `transcripts/NN-curation.md` |
| 0 (reframe-then-ideate) | Opportunity reframe (recover HMW question from brief) before brainstorm | `transcripts/NN-reframe.md` |
| 1 | Inputs-gen for missing R/O/C sections | `transcripts/NN-inputs-<section>.md` |
| 2 | Incubator (spec → hypotheses) | `hypotheses.json` + `transcripts/NN-incubator.md` |
| 3 | Per-hypothesis design build | `artifacts/<hyp-id>/` + `transcripts/NN-build-<slug>.md` |
| 3.5 | Honesty check — flags hand-waving in bet-critical paths | `transcripts/NN-honesty-<slug>.md` + verdict on `summary.md` |
| 4 | Evaluator (LLM + Playwright; only with `--evaluate`) | `evals/<hyp-id>.json` |

`--no-build` skips stages 3, 3.5, and 4. Used for matrix experiments that study upstream stages at scale (see [`scripts/matrix-runner.ts`](scripts/matrix-runner.ts)). `--dry-run` composes prompts but doesn't call any provider.

## Flows

Each flow is a TypeScript file in `src/flows/` that exports a `runFlow(input)` function. Adding a flow = adding a file. The CLI dynamically imports the file by name.

Current:

- **ideation** — **default flow.** Two extra stages before canonical: (0a) divergent brainstorm — 10-15 categorically different product directions, anti-censorship ("the wilder the better"); (0b) convergent curation in three parts: (i) **product-shape filter** — each pick must be a digital product (cycle 26); service / meeting / config seeds are transformed into product seeds or set aside; (ii) **surface fit** — when the constraints declare a `Target surfaces` value, picks must fit it; (iii) **spread maximization across digital products**. The 5 picked directions are stitched into the brief as a `<product_shape_candidates>` block and the canonical pipeline runs from there. Validated on both high-gravity and low-gravity briefs (cycles 11, 12, 15); the product-shape gate validated cycle 26 (92% pass); the cycle-27 hypothesis-stage backstop adds a switch-reason check that requires the rationale to name a software-unique mechanism, not an adjective. Introduced cycle 11 as `wild-ideation`, renamed to `ideation` cycle 17.
- **canonical** — fast path. High-fidelity reproduction of production: optional inputs-gen for missing or regen-flagged sections → incubator → per-hypothesis design build → optional evaluation. Use when the divergent/convergent split is overkill (single-hypothesis bug-fix verification, prompt unit-tests, etc.).
- **reframe-then-ideate** — composition. Runs reframe → brainstorm → curation → canonical. Tests whether the brainstorm seeing the recovered HMW question produces a wider spread than `ideation` alone. The 384-cell matrix put it within rep-noise of plain `ideation`; kept as the only standing data point for a multi-stage composition.
- **inputs-gen** — focused. Runs only stage 1 (research / objectives / constraints generation). Skips incubator, build, and evaluation. Use it for tight iteration on `gen-research.md` / `gen-objectives.md` / `gen-constraints.md`.

_Retired cycle 21: `reframe-upstream` (HMW recovery without a downstream brainstorm). The 384-cell matrix and a per-brief breakdown showed it within rep-noise of `canonical` — the recovered HMW often restated the prescription, as cycle 19 had hand-flagged. Historical findings preserved in [iteration-log.md](iteration-log.md)._

To compare runs, use `pnpm exp diff <a> <b>`.

## Spec section sourcing — the experimentation surface

Every spec section can come from the user, the agent, or a mix. The CLI surface lets you exercise the full grid:

| Scenario | Command |
|---|---|
| All-agent (brief only) | `pnpm exp run canonical --brief X.md` |
| All-user (everything supplied) | `pnpm exp run canonical --brief X.md --research R.md --objectives O.md --constraints C.md` |
| Mixed (some user, rest generated) | `pnpm exp run canonical --brief X.md --objectives O.md` |
| Force-regen specific sections even when supplied | `pnpm exp run canonical --brief X.md --research R.md --regen-inputs research-context` |
| Single-section focus (tightest iteration loop on one prompt) | `pnpm exp run inputs-gen --brief X.md --target objectives-metrics` |
| Inputs-gen only (no incubator/build) | `pnpm exp run inputs-gen --brief X.md` |
| Inputs-gen with mixed sources | `pnpm exp run inputs-gen --brief X.md --research R.md` |
| Iterate on a prompt with your draft as the seed | `pnpm exp run inputs-gen --brief X.md --target objectives-metrics --objectives O.md --regen-inputs objectives-metrics` |

Section ids accept short aliases: `research`, `objectives`, `constraints` map to `research-context`, `objectives-metrics`, `design-constraints`.

### Source transparency

Every section that flows downstream gets a transcript:

- **Generated** sections produce a normal `NN-inputs-<section>.md` transcript with the full prompt + response.
- **User-supplied** sections produce a `NN-<section>-source.md` transcript noting the file path and content. The "system prompt" field of that transcript records the source path.
- **Regenerated** sections (user-supplied + in `--regen-inputs`) produce a normal generation transcript whose `<current_input_draft>` block in the prompt body is the user's content. Lets you see exactly what the model rewrote and how.

So an agent reading any run can answer "where did this section come from?" by looking at the transcripts directory alone.

## Critique loop

The tool is built for paired calibration:

1. Agent runs an experiment → reads `summary.md`, transcripts, artifacts, evals → writes `critique.md`.
2. Human gives feedback **inline in chat** (corrections, additions, what the critique missed).
3. Agent captures the chat feedback into `runs/<id>/feedback.md` so it persists across sessions. The human does not have to edit feedback.md directly — that's the agent's job.
4. Periodically: agent reads accumulated `feedback.md` files, identifies pattern divergences, proposes edits to `experiments/critique-guide.md` (the persistent heuristics file). Human approves inline.
5. Over time, the critique-guide calibrates the agent's judgment toward the human's. Eventually it can be promoted into a tool-baked critique step that runs automatically.

Today the critique step is conversational. Four files are the durable record so future-session agents start from the calibrated state:

- **`critique-guide.md`** (this directory) — evolving judgment heuristics, edited via consolidation passes
- **`iteration-log.md`** (this directory) — chronological narrative of prompt-edit cycles, what was changed, why, the run that tested it, and what's still open. Maintained by the agent. **Add a new cycle entry every time prompt edits are made.**
- **`runs/<id>/critique.md`** — agent's per-run analysis with three calibration questions at the end
- **`runs/<id>/feedback.md`** — agent-captured chat feedback from the human

A future-session agent picking up cold should read this README first, then `iteration-log.md` to understand where we are in the prompt-evolution work, then `critique-guide.md` for judgment heuristics. Snapshots in `_versions/` directories hold exact prompt content at each checkpoint and pair with the iteration log's narrative.

Phase 2 will add an automated critique LLM call that reads `critique-guide.md` as a system prompt.

## Cost guardrails

- **Per-run token cap** — defaults to 200k. Override with `--cap-tokens N`. Refuses to start subsequent stages when crossed; partial outputs preserved.
- **Daily token cap** — defaults to 1M, tracked in `experiments/.cost-ledger.jsonl` (gitignored). Refuses to start a new run when crossed.
- **`--dry-run`** — composes prompts and writes them to the run dir without calling providers. Use this to verify flow shape and prompt assembly before spending tokens.

Token estimates pre-send are rough (~4 chars per token). Real usage gets logged from provider responses where available. Pi-sandbox calls don't surface usage to the experiments tool, so estimate-only there.

## Defaults

- Provider: `openrouter`
- Model: read from `config/task-defaults.json` (the same file the app pins), so the CLI
  cannot drift from the shipped default. Currently `deepseek/deepseek-v4.1-flash`.
- Evaluator provider/model: same as build unless overridden with `--evaluator-provider` / `--evaluator-model`.

Override with `--provider` / `--model` on the CLI.

## Caveats

- LLM outputs are non-deterministic. Single-run differences may be noise; structural shifts across multiple runs are signal. Don't over-read one run's score deltas.
- The tool imports from both `server/` and `src/`. `tsx` runs without strict tsconfig enforcement so it works at runtime; IDE type-checking may be quieter or noisier in `experiments/` than elsewhere.
- The Pi sandbox emits real LLM logs to `logs/observability/` when `OBSERVABILITY_LOG_BASE_DIR` is set (dev default). The experiments tool's transcripts are independent of that — they're written from the experiment side after the call returns.
- For evaluator runs, the tool currently does **not** spin up a preview server, so `runEvaluationWorkers` will create a preview session in-memory but the URL won't be reachable from a browser-grounded evaluator unless the regular dev server is up. Browser eval runs that depend on preview reachability may degrade gracefully.

## Adding a flow

1. Copy `src/flows/canonical.ts` to `src/flows/your-flow.ts`.
2. Modify the stage composition. Most experiments are: change the order, insert a stage, swap which prompts get used, mutate the spec block content.
3. Run `pnpm exp run your-flow --brief <…> --dry-run` to verify prompt assembly.
4. Live run when satisfied.

For experiments that need to add prose context to downstream stages (the most common pattern), prepend or append a tagged block to the relevant spec section content. The `<specification>` block is the universal prose carrier — every downstream stage reads it, no schema change needed.
