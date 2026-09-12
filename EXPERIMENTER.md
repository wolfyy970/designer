# Experimenter

A discovery-level overview of the in-repo experimentation surface: what it is, how to use it, and what we've actually learned from it. For tool-level details (CLI flags, run directory layout, every flow file), the canonical reference is [`experiments/README.md`](experiments/README.md). For the chronological story of every cycle of prompt edits, the canonical record is [`experiments/iteration-log.md`](experiments/iteration-log.md).

## What it is

A small CLI in [`experiments/`](experiments/README.md) that drives **the same prompt-assembly, Pi sandbox, and evaluator modules the production canvas uses** — but from scripts instead of through the React UI. It exists for one job: iterate on **prompt content** and **flow shape** (which stages run, in what order, with what outputs) outside the canvas, so we can study behavior at scale without paying UI coupling cost on every change.

It is **not the canvas.** It is **not a workspace package.** It is an app-coupled tooling folder that imports from `server/services/`, `server/lib/`, `src/lib/prompts/`, and `packages/auto-designer-pi/` directly. Results don't auto-flow to production — promotion is a deliberate step (edit the prompt file, or wire a new route stage, by hand).

Three concepts to hold in mind:

- **Flow** — a TypeScript file in `experiments/src/flows/` that exports `runFlow(input)`. Adding a flow = adding a file.
- **Run** — one invocation of a flow. Produces `experiments/runs/<run-id>/` with `summary.md`, `spec.md`, `hypotheses.json`, `transcripts/`, `artifacts/`, `evals/`.
- **Matrix** — a parametric cross-product of (flow × brief × input-mix × count × rep) run in-process with bounded concurrency. Lives in `experiments/matrix/<matrix-id>/` with `manifest.json`, `status.json`, `results.jsonl`, plus aggregator outputs.

## How to use it

### Single runs

```bash
# Compose prompts without spending tokens (verifies flow shape)
pnpm exp run ideation --brief experiments/briefs/your-brief.md --dry-run

# Live run on the default flow
pnpm exp run ideation --brief experiments/briefs/your-brief.md

# Fast path — canonical (no brainstorm prelude)
pnpm exp run canonical --brief experiments/briefs/your-brief.md

# Browse what you've already produced
pnpm exp list
pnpm exp show <run-id>
pnpm exp open <run-id>    # opens preview.html gallery in browser
pnpm exp diff <run-a> <run-b>
```

Full CLI surface, all flags, run-dir layout: [`experiments/README.md`](experiments/README.md).

### Matrix experiments

```bash
# Smoke test: 8-cell pilot
pnpm tsx experiments/scripts/matrix.ts --scope pilot --concurrency 6

# Full scope: ~384 cells (4 flows × 4 briefs × 5 input-mixes × 4 counts × 3 reps)
pnpm tsx experiments/scripts/matrix.ts --scope full --concurrency 8

# Aggregate + analyze a completed matrix
pnpm tsx experiments/scripts/aggregate-matrix.ts --matrix-dir experiments/matrix/<id>

# Retry transient failures (provider stream stalls) in a matrix
pnpm tsx experiments/scripts/retry-fails.ts --matrix-dir experiments/matrix/<id>

# A targeted experiment isolating one variable
pnpm tsx experiments/scripts/anti-repetition-experiment.ts --concurrency 8 --reps 5
pnpm tsx experiments/scripts/anti-repetition-analyze.ts --matrix-dir experiments/matrix/<id>
```

A 384-cell matrix at 8-way concurrency takes ~100 minutes wall time on a Mac Studio. **Don't run a full matrix on a dev laptop** — provider concurrency is fine but the parallel transcript writes will spike disk I/O. The Studio has 256 GB of RAM; each cell is ~250-300 MB resident, so 8 cells × 300 MB is a rounding error there.

## Flows currently available

| Flow | What it does | Default? |
|---|---|---|
| `ideation` | Brainstorm 10–15 wild directions → curate 5 for spread → canonical pipeline. The 5 are stitched into the brief as `<product_shape_candidates>`. | **Yes** (CLI default) |
| `canonical` | Production pipeline reproduction: inputs-gen → incubator → build → optional eval. No brainstorm. | |
| `reframe-then-ideate` | Reframe brief as HMW → brainstorm → curation → canonical. Multi-stage composition. | |
| `inputs-gen` | Only stage 1 (research / objectives / constraints). Tightest loop for tuning those three prompts. | |

Retired cycle 21: `reframe-upstream` (HMW recovery without a downstream brainstorm). The 384-cell matrix put it within rep-noise of canonical — the recovered HMW often restated the prescription. Historical findings preserved in [`experiments/iteration-log.md`](experiments/iteration-log.md).

## What we've actually learned

The experiments tool has driven 21+ cycles of prompt iteration. The biggest empirical study was a 384-cell matrix + 60-cell follow-up. Five findings emerged with strong-enough signal to act on; all five have already been promoted into the production canvas.

### Findings (production-promoted)

#### 1. Rep-noise floor is high

Three reps of the *exact same config* (same flow, brief, mix, count) share only **~19% of their vocabulary** on average. themeClusterRatio across the 3 reps averages 0.78 — meaning if a config produces 15 hypothesis cards across 3 runs, ~12 are thematically distinct and ~3 are paraphrases.

**Implication**: any cross-config delta smaller than ~0.05 on these metrics is within rep-noise. Single-run reads of any prompt change are unreliable.

#### 2. The brainstorm-and-curate prelude widens the corpus

Compared to canonical, the `ideation` flow produces:

| metric | canonical | ideation |
|---|---|---|
| themeClusterRatio (% distinct across 3 reps) | 0.731 | **0.843** |
| crossRepConvergence (vocab shared between reps) | 0.189 | **0.157** |
| within-rep pairwise sim (internal diversity) | 0.158 | **0.135** |
| wall time | 105s | 161s (+53%) |

15% more distinct themes at +50% wall cost. **Effect is consistent across briefs but reverses on tightly-scoped ones** (icu-handoff: canonical 0.955 beat ideation 0.910). Brainstorming over-conditions the model when the brief has strong structural priors.

**Production promotion**: optional **Brainstorm directions first** toggle on the IncubatorNode. Off by default; the help-tooltip flags the trade-off.

#### 3. Asking for more hypotheses doesn't give you proportionally more distinct themes — but multiple runs do

| asked for | total across 3 reps | distinct concepts |
|---|---|---|
| 3 | 9 | ~7 (78%) |
| 5 | 15 | ~12 (80%) |
| 7 | 21 | ~16 (76%) |
| 10 | 30 | ~22 (73%) |

In a single c10 call, the marginal cards past ~5 are mostly paraphrases of the first 5. But across multiple c5 calls (with the prompt's `existingStrategies` anti-repetition block), each new run starts from a different stochastic position and explores different territory.

**Follow-up experiment** (60 cells, 3 arms × 4 briefs × 5 reps): asking for c5+c5 with anti-repetition beats a single c10 by ~3% on distinct-concept count (9.22 vs 8.95 out of 10). Splitting *without* anti-rep is actually worse than single c10 (8.40) — confirming that the anti-rep prompt block is doing the work, not the splitting.

**Production promotion**: `DEFAULT_COUNT` bumped 3 → 5 on the IncubatorNode. Generate button copy shifts to **Generate more** after the first run, with a help-tooltip explaining that re-clicking adds distinct cards rather than duplicates.

#### 4. Supplied research narrows; agent-generated research explores

| mix | themeClusterRatio across reps |
|---|---|
| all-agent (R/O/C all generated) | 0.817 (highest variety) |
| user-supplied research only | 0.692 (most convergent) |
| user-supplied all three | 0.754 |

A 0.13 swing — well above the noise floor. Supplied context anchors the incubator to a frame; agent-generated context lets it wander.

**Implication for UX**: user-typed vs Generate-button research are not interchangeable conveniences. They produce systematically different output character. **Production promotion**: a `DsHelpTooltip` on the InputNode's Generate wand surfaces the trade-off ("Click Generate to let the agent explore. Type your own to anchor a specific frame.").

#### 5. c10 silent failures are provider stalls, recoverable on single retry

13.5% of c10 cells in the first matrix silently failed — the model accepted the request, started streaming, then stalled mid-output. The 45s stream-idle watchdog ([`server/services/pi-agent-runtime.ts`](server/services/pi-agent-runtime.ts)) correctly caught and aborted them. Original framing was wrong: it's not a model capability limit at c10, it's that the longer expected output gives more wall-clock window for a provider-side stall.

**Validation**: retried all 18 silent fails once — 18/18 recovered.

**Implication**: the runtime's watchdog is doing its job. If we see a >2% rate of `StreamIdleError` on incubator regenerations in production, raise the watchdog from 45s to 90s. Until then, leave it alone.

### Methodology lessons (the craft of doing this)

Things future-me would otherwise re-discover the painful way:

- **Three reps is the minimum credible read.** A single rep lies — the rep-noise floor (Finding 1) means one run shares only ~19% vocabulary with two other runs of the same config. If you ever feel tempted to argue from a single matrix cell, you're arguing from one slice of many possible corpora. Use 3-rep means as the comparison unit; treat n=2 cells (where a cell silent-failed once) as soft evidence.
- **Effect size, not p-value.** We don't have a statistical framework here — we have repeated directional comparisons. ~0.05 on `themeClusterRatio` is the practical noise floor; treat smaller deltas as inconclusive. The anti-repetition experiment's headline (B vs A = +0.27 out of 10 distinct concepts) is real but small; B vs C = +0.82 is the substantive signal because it isolates the anti-rep mechanism.
- **Freeze upstream noise when measuring a downstream stage.** `anti-repetition-experiment.ts:ensureFrozenSpec()` generates research/objectives/constraints once per brief and writes them to `experiments/matrix/<id>/specs/<brief>.json`, then all 15 cells per brief reuse that exact spec. Without this, inputs-gen variance smears across the incubator measurement and you can't see the variable you're trying to isolate. **If you're testing an incubator-stage change, freeze the spec.**
- **Threshold 0.18 on title-weighted Jaccard is the calibrated value for clustering.** [`experiments/scripts/aggregate-matrix.ts`](experiments/scripts/aggregate-matrix.ts) uses `0.6 × title-Jaccard + 0.4 × full-Jaccard`. Earlier passes used `0.4` on full-text Jaccard alone — every cell came back at `themeClusterRatio = 1.0` (nothing ever clustered) because hypothesis titles are 1–3 tokens and bet-prose is 50–100 tokens of distinctive paraphrase. Don't tune this lower without re-validating against the existing corpus.
- **Don't run matrices on a laptop.** Disk writes spike (transcripts + observability NDJSON), Vite watch goes insane if `experiments/runs/` is in the watch set, macOS Spotlight indexes every transcript. Use Mac Studio over SSH, `nohup pnpm tsx ...`, monitor with `tail -F` over SSH from anywhere. Add `experiments/runs/` and `logs/` to Spotlight Privacy locally to stop the indexer churn.
- **The matrix orchestrator's "done" count is not "produced hypotheses" count.** Production-style failures (stream-idle abort caught by the 45s watchdog → flow writes `❌ Fatal error` to `summary.md` and returns cleanly) get classed as `done` because the flow didn't throw. We added a post-flow integrity check in `experiments/scripts/matrix-runner.ts` that surfaces missing `hypotheses.json` as `failed`. Future-debugging signal: if your numbers feel off, check the gap between `len(results)` and `len(cells.json)`.
- **`retry-fails.ts` recovers transient provider stalls.** It reads the matrix `results.jsonl` + `cells.json`, finds cells that hard-failed OR completed-without-hypotheses, and re-runs them. We saw 18/18 recovery rate on first retry. Use it before declaring a matrix done; don't burn a fresh matrix to investigate a stall pattern.

### Mechanism insights (what we now understand about how this system actually behaves)

- **In-stream attention vs. fresh stochastic position.** A single c10 incubator call lets the model see its own first 5 picks via attention and try to diverge from them for picks 6–10. A second c5 call starts from a different stochastic position entirely — completely separate context, no shared attention. The anti-rep experiment proved these two paths are not equivalent: splitting *without* `existingStrategies` actually produces *more* overlap than a single c10 (C=8.40 vs A=8.95) because two unrelated calls collide on common concepts; splitting *with* `existingStrategies` beats both (B=9.22). **The anti-rep prompt block is what bridges the gap between fresh-position-randomness and structured no-overlap.** This is the deepest learning of the work.
- **Per-stage timeouts are an outer safety net; the stream-idle watchdog is the primary signal.** The Pi runtime's 45s stream-idle watchdog (no chunks for 45s → abort with `StreamIdleError`) catches actual fetch-layer stalls. The experiments-tool's `STAGE_TIMEOUT_MS` is for cases the watchdog can't see (streamFn never resolved, tool-loop with legitimate stream activity that never terminates). Production has only the watchdog. If you bump a stage timeout, ask first whether the failure mode it addresses can already be caught by the watchdog — bumping unnecessarily masks real bugs.
- **Provider behavior is the dominant cost variable.** At the time of measurement, a c10 cell on minimax/minimax-m2.5 averaged 105–161s; the same flow on a different model could be 2× or 5× different. We have not tested generalization. Don't quote our wall-time numbers as system properties; they're properties of *this provider × this model × this prompt corpus*.
- **The `<product_shape_candidates>` block is the universal prose carrier between stages.** Need a new flow that injects context into every downstream stage? Stitch it into the design brief content as a tagged XML block. The block propagates through `buildInternalContext(spec)` to every prompt that ingests the spec — no schema change needed. This pattern is the lowest-overhead way to test new prelude stages; we used it for both `ideation` (curated candidates) and the production brainstorm prelude.

### Reframings (claims we made that were wrong on the cause)

What I would carefully re-state if I picked this up cold:

- **"c10 has a 23% failure rate" → "c10 has a longer expected stream and therefore more wall-clock window for provider-side stalls."** Original framing made this sound like a model capability limit ("can't sustain 10 directions in one response"). Actual mechanism: longer stream = more time for OpenRouter/Minimax to stall mid-token. c3 hits the same stalls at ~1.1%; c10 at ~13.5%. It's a hazard rate that scales with response duration. With a retry layer the effective failure rate is ~0%.
- **"Brainstorming gives you wider variety" → "Brainstorming widens corpus spread on open-ended briefs; it can narrow it on tightly-scoped ones."** ICU-handoff (regulated medical handoff, strong structural priors): canonical themeClusterRatio 0.955, ideation 0.910. The brainstorm step churned out 15 angles but curation could only find 5 spread-spanning picks within a narrow space, and the brief's strong priors already prevent canonical from converging. **Always check brief × treatment, don't generalize the variety claim.**
- **"Supplying your own research is worse than letting the agent generate it" → "Supplying narrows, agent-generating explores. Both are valid; pick by intent."** Phrased as a quality claim it's wrong; phrased as a behavioral claim it's right. Reframed in the production UI as a deliberate trade-off (`DsHelpTooltip` on InputNode), not as a default-vs-better.
- **"Reps share 19% vocabulary" — this is the floor for *fresh* reps, not for production regenerate.** My main matrix tested independent reps with no shared context. Production's Regenerate path passes `existingStrategies`, which is a different beast entirely. Don't conflate the two when reasoning about variety.

### Open questions (things we still don't know)

- **Theme spread ≠ theme quality.** All our metrics measure variety. Whether one of the 5 cards is "the right one" requires evaluator runs (excluded for time/cost). The anti-rep experiment showed B wins on count of distinct concepts; we don't know if those concepts are *better*.
- **Does spread translate to downstream design quality?** The matrix stopped at stage 2 (incubator). Whether ideation's wider hypothesis corpus produces better stage-3 (per-hypothesis design build) artifacts is untested.
- **How much of this is provider-specific?** We've measured one model. Other models likely have different stall rates, count-saturation curves, and brief-sensitivity. Findings should be re-validated when the production lockdown model changes.
- **Semantic-similarity ceiling.** Bag-of-words Jaccard treats "Memory Vault" and "Memory Archive" as ~33% similar (one shared token / three total). A future iteration with sentence-transformer embeddings would likely show closer ratios and recompute several of our findings — possibly shifting the brainstorm advantage from +15% to something smaller. Worth doing before claiming the matrix findings are settled.

## How to run your own experiment

The general pattern is:

1. **State the hypothesis sharply** — what specific change to prompt or flow shape, and what would observably change in the output? Vague hypotheses produce uninterpretable results.
2. **Pick the smallest matrix that tests it** — usually one variable at three levels × a few briefs × a few reps. The anti-repetition experiment was 3 arms × 4 briefs × 5 reps = 60 cells. The pilot version was 1 brief × 3 reps = 12 cells.
3. **Freeze upstream noise** — if you're testing the incubator stage, generate the R/O/C inputs once and reuse the same spec across all cells. The anti-repetition experiment did this via `ensureFrozenSpec()` in `experiments/scripts/anti-repetition-experiment.ts`.
4. **Use 3-rep-and-union as the standard read** — single runs are unreliable per Finding 1.
5. **Aggregate with transparent metrics** — bag-of-content-words Jaccard with title-weighted clustering at threshold 0.18 is what we use. Imperfect (synonyms register as distinct) but transparent. See [`experiments/scripts/aggregate-matrix.ts`](experiments/scripts/aggregate-matrix.ts).
6. **Run on Studio, not laptop**. SSH in, `nohup pnpm tsx ...`, monitor with `tail -F` from anywhere.
7. **Write up findings as `analysis.md` next to the matrix** — the script generators do this for the canonical metrics; bespoke experiments get a one-off script next to `aggregate-matrix.ts`.

The runtime layer ships a stream-idle watchdog (45s) and typed errors (`StreamIdleError`, `StageTimeoutError`) so transient flakiness retries cleanly and persistent stalls surface as actionable signal. Use [`experiments/scripts/retry-fails.ts`](experiments/scripts/retry-fails.ts) to recover provider-side stalls without re-running the whole matrix.

## The critique loop

[`experiments/critique-guide.md`](experiments/critique-guide.md) is an evolving file of judgment heuristics — what makes a hypothesis well-formed, what counts as MVP-shaped vs over-scoped, how to recognize generic AI patterns vs grounded design directions. It's maintained as a paired calibration artifact: agent reads run output → writes `critique.md` for that run → human gives feedback in chat → agent captures it into `feedback.md` → periodic consolidation passes update `critique-guide.md`.

This is the layer where the experiment becomes a continuous calibration loop rather than a one-off study. For a future-session agent picking up the work cold, the read order is:

1. This file (Experimenter.md) — what it is + what's been learned
2. [`experiments/README.md`](experiments/README.md) — tool surface
3. [`experiments/iteration-log.md`](experiments/iteration-log.md) — the chronology
4. [`experiments/critique-guide.md`](experiments/critique-guide.md) — current judgment heuristics

## Where this work has landed in production

Five of five findings have been promoted to the canvas as of cycle 21:

- `DEFAULT_COUNT` 3 → 5 on the IncubatorNode
- **Brainstorm directions first** toggle on the IncubatorNode (off by default; trade-off in tooltip)
- **Generate more** state-aware button copy when hypotheses already exist
- Inline subhead encouraging Regenerate to surface anti-repetition behavior
- `DsHelpTooltip` on InputNode Generate explaining narrow-vs-explore trade-off

Plus one observability follow-up: monitor production for `StreamIdleError` on incubator regenerations; raise the 45s watchdog to 90s only if rate exceeds 2%.

The tool itself has also evolved:

- Three new flows (`ideation`, `reframe-then-ideate`, `inputs-gen`) plus the retired `reframe-upstream`
- A matrix runner with concurrency control, manifest, status JSON, append-only results, and a retry-fails script for recovering transient provider stalls
- Two analyzer scripts that emit `analysis.md` with cross-arm comparisons, per-brief breakdowns, and effect sizes
- Anti-repetition-experiment script (the cleanest controlled experiment we've run) plus its dedicated analyzer

This document will need updating as new cycles land. The mechanical record stays in [`experiments/iteration-log.md`](experiments/iteration-log.md); this file is the synthesis layer.
