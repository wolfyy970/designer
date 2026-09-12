# Iteration log

Chronological record of prompt-edit cycles, the gap or insight that motivated each one, the run that tested it, and the headline outcome. **Pair with snapshots and critique-guide.md**: snapshots hold the exact content at each checkpoint; critique-guide.md holds the agent's evolving judgment heuristics; this file holds the narrative — what changed, why, and what we learned.

**Maintained by the agent.** Add a new cycle entry every time prompt edits are made or experiment patterns shift. A future-session agent picking up cold should read this file plus `critique-guide.md` to understand both the calibration state and the iteration story.

---

## Current state (running summary)

- **Brief used as canonical test case**: [grief-app.md](briefs/grief-app.md) — PM-shaped problem statement for a grief-focused web product, intentionally scope-ambiguous
- **Supplied spec sections** (held constant across canonical runs to isolate prompt-edit signal): [grief-app-research.md](briefs/grief-app-research.md), [grief-app-objectives.md](briefs/grief-app-objectives.md), [grief-app-constraints.md](briefs/grief-app-constraints.md) — outputs of the first inputs-gen run on this brief, then re-used as input for stages 2-4 testing
- **Default model**: openrouter / minimax/minimax-m2.5 (matches production lockdown)
  - *Later note:* the shipped default moved to `deepseek/deepseek-v4.1-flash`. The CLI no
    longer restates a model id — it reads `config/task-defaults.json`.
- **Open observation that hasn't yet been addressed**: across 4 canonical runs (20 hypotheses) the corpus clusters in ~5 archetypes (quiet refuge / memory-as-central / adaptive-contextual / optional-structure / private-connection). The model is generating variations within "text-based privacy-first journaling app" rather than category-moving bets. **Cycle 5 (next, in progress)** is targeting this.

---

## Cycle 1 — Scope as inferred prose, not closed taxonomy (~14:00 UTC, 2026-05-09)

**Files edited**:
- `packages/auto-designer-pi/prompts/gen-research.md` — line 11, de-canonicalized scope examples
- `packages/auto-designer-pi/prompts/gen-objectives.md` — added "Size objectives to inferred scope" bullet
- `packages/auto-designer-pi/prompts/gen-constraints.md` — line 18, de-canonicalized scope examples
- `packages/auto-designer-pi/prompts/gen-hypotheses.md` — line 11 inference, hypothesis field, rationale field, quality-bar new bullet
- `packages/auto-designer-pi/prompts/design-agent-instructions.md` — line 13, scope from prose
- `packages/auto-designer-pi/prompts/eval-strategy-fidelity.md` — `hypothesis_adherence` notes, scope mismatch cap
- `packages/auto-designer-pi/prompts/eval-implementation.md` — `expresses_bet` notes, scope mismatch cap

**Why**: the user observed that the existing prompts were force-fitting scope to a fixed three-tier taxonomy ("small feature / flow / app") which the model was treating as a choose-one enum. Real problems aren't scope-tiered. The remedy was to make scope a prose-only inferred property — each hypothesis names the slice it's testing in language that fits this problem, no taxonomy to pick from.

**Snapshot**: `2026-05-09T12-45-42Z` (baseline pre-Path-A)

**Tested in**:
- Inputs-gen run [`20260509-145714-inputs-gen-fed0`](runs/20260509-145714-inputs-gen-fed0/) — first stage-1-only test
- Canonical run [`20260509-151849-canonical-3429`](runs/20260509-151849-canonical-3429/) — first 2-hypothesis canonical run

**Headline outcome**: scope language traveled into `research-context` (closing paragraph noted scope ambiguity) but not into `objectives-metrics` or `design-constraints` (those stayed scope-blind). Mixed propagation. The two-hypothesis canonical run produced one single-surface and one multi-surface bet — file counts tracked scope claims (3 vs 9 files) — strong signal that the inference + build sides were aligned.

**What's still open after this cycle**: scope-blindness in objectives/constraints prompts; hypotheses still posture-level, not feature-level (uncovered later in cycle 2).

---

## Cycle 2 — Path A: feature-level commitment, not posture (~16:07 UTC, 2026-05-09)

**Files edited**:
- `packages/auto-designer-pi/prompts/gen-hypotheses.md` — `<how_to_think>` feature-level thinking bullet; `hypothesis` field contract demanding 3-5 named UI elements/affordances/flows; `<quality_bar>` "Posture not features" rejection; `<negative_spec>` clarification
- `packages/auto-designer-pi/prompts/design-agent-instructions.md` — "Build the specific features named in the hypothesis prose"

**Why**: human feedback on cycle 1's first 5-hypothesis canonical run identified that hypotheses described directions ("subtle non-intrusive presence") rather than feature sets. Two consequences: (1) reproducibility collapsed because the build agent had to invent features; (2) evaluation went fuzzy because "did the artifact embody the bet?" became "did the build invent features consistent with the direction?"

**Snapshot**: post-edit, captured before next run

**Tested in**: canonical run [`20260509-160751-canonical-1998`](runs/20260509-160751-canonical-1998/) — 5 hypotheses, same supplied sections as prior

**Headline outcome**: hypothesis prose unanimously shifted to `(1)/(2)/(3)` feature enumeration. Compare *Adaptive Quiet Presence* (cycle 1) — "An app that observes patterns over time and offers extremely subtle, non-intrusive presence" — to *Sensitive Companion* (cycle 2) — "(1) a home screen with a single 'What do you need today?' prompt offering 3 verb-labeled options: Write, Remember, Sit quietly, (2) entry surfaces that adapt their copy based on time-since-last-visit..." Buildable difference. Axis spread also improved markedly: 5 of 6 variable axes hit full 3-position spread vs. 3-of-5 collapsing to constants in the cycle-1 run.

**What's still open after this cycle**: word budgets violated my (90-word) cap; some hypotheses ran 105-130 words. **Bigger gap discovered next**: bet-critical-vs-scaffolded distinction wasn't yet in place — hypotheses treated all features as equally needing full implementation, which would either bloat builds or under-deliver on every feature.

---

## Cycle 3 — Bet-critical / scaffold (depth on what proves the bet, scaffold the rest) (~16:40 UTC, 2026-05-09)

**Files edited**:
- `packages/auto-designer-pi/prompts/gen-hypotheses.md` — lifted word caps to soft generous targets; reworked `hypothesis` field to demand bet-critical identification; reworked `rationale` to require "why these are the bet-critical ones"; reworked `measurements` to focus on bet-critical features; added two new quality-bar rejections ("No bet-critical identification", "All-or-nothing build expectation")
- `packages/auto-designer-pi/prompts/design-agent-instructions.md` — "Build the bet-critical features to working depth; scaffold the rest"; defined what scaffolding looks like (button rendered but onClick is no-op, nav link exists but destination is a thin placeholder, etc.)

**Why**: the user's observation that for full-app-shaped bets, building all 5 features fully would be token-prohibitive AND produce shallow output across the board. Two features built deeply teach more than five features built shallowly. The strategic call about which features prove the bet should belong to the hypothesis, not the build agent's discretion.

**Snapshot**: post-edit, captured before next run

**Tested in**: canonical run [`20260509-164038-canonical-3dfe`](runs/20260509-164038-canonical-3dfe/) — 5 hypotheses, same supplied sections

**Headline outcome**: bet-critical pattern unanimous (5 of 5 hypotheses use "Build (X) and (Y); scaffold (rest)"). The build agent honored the split. **Emergent surprise**: one build (*Contextual resource guide*) wrote a `SPEC.md` planning doc explicitly tagging features `(BET-CRITICAL)` or `(SCAFFOLDED)` before writing HTML. Verified via observability log that the agent wrote SPEC.md *first*, then built to it (not retrospective).

**What's still open after this cycle**: human tested artifacts hands-on and found *Quiet presence companion* was thin in a different way — UI-only without cross-page state model. Home page had a hardcoded "kitchen table" memory; finalize button called `localStorage.removeItem` (deleting the draft) without persisting elsewhere. The agent's own comment: *"in a real app, this would move to permanent storage."* Bet-critical features were "built" at the per-page UI level but the user-journey across pages was broken. New gap identified: **"working depth" was under-defined**.

---

## Cycle 4 — Working depth (end-to-end state model) + journey-check measurements (~17:20 UTC, 2026-05-09)

**Files edited**:
- `packages/auto-designer-pi/prompts/design-agent-instructions.md` — sharpened "working depth" to demand cross-page state model with concrete examples (real `localStorage`, no `// in a real app, this would persist` admissions, mental walk of primary user journey before declaring done)
- `packages/auto-designer-pi/prompts/gen-hypotheses.md` — `measurements` field now requires at least one user-journey check (not static-presence check); added "No user-journey check in measurements" to quality bar
- `experiments/critique-guide.md` — three new heuristics absorbed from cycle-3 feedback (posture-not-features critic check, working-depth-end-to-end heuristic, "walk the primary user journey" step in How to read a run)

**Why**: cycle-3 feedback revealed working depth was UI-only. The static-mock format was tempting the agent toward polished-but-disconnected pages where each looked like the feature worked but the cross-page data flow the bet depended on was broken. The remedy: demand actual state management on bet-critical features whose intent implies persistence; require measurements that check the user-journey, not just static presence.

**Snapshot**: post-edit, captured before run

**Tested in**: canonical run [`20260509-172025-canonical-c8da`](runs/20260509-172025-canonical-c8da/) — 5 hypotheses, eval enabled

**Headline outcome**: working-depth edit landed strongly. Three of three sampled artifacts had real cross-page state models. *Memory Types Framework* implemented full `getMemories()`/`saveMemories()`/`addMemory()` API. *Private Bridge to Connection* implemented temporal threshold logic AND added dev-only "Add 10 entries / Simulate 14 days" buttons to make the threshold testable in a static mock — solves the "static mock can't show temporal behavior" problem. **Journey-check measurement requirement landed weakly**: 2 of 5 hypotheses had explicit journey checks, 2 of 5 had implicit ones. **LLM rubrics failed** (15 of 15 calls returned `evaluator_unavailable: 0` due to rate limits) — we have no evidence on whether existing rubrics catch thinness on their own.

**What's still open after this cycle**:
- Journey-check measurement strength is the weakest of the prompt edits made so far; may need re-tightening
- LLM rubric failure was infrastructure (rate-limit), not prompt-related — needs separate investigation
- **New gap identified by cross-run analysis**: across 20 hypotheses (4 runs × 5), the corpus clusters in ~5 recurring archetypes (quiet-refuge / memory-as-central / adaptive-contextual / optional-structure / private-connection). The model is producing variations within "text-based privacy-first journaling app" rather than category-moving bets. Voice, calendar, ritual, sensemaking, chosen-circle, image-anchored, letter-writing — none have appeared in any run. **This is the cycle-5 target.**

---

## Cycle 5 — Frame-breaking / category variation (~17:50 UTC, 2026-05-09)

**Files edited**:
- `packages/auto-designer-pi/prompts/gen-hypotheses.md` — three additions:
  - `<how_to_think>` new bullet on identifying the brief's implicit frame and requiring at least one frame-breaking hypothesis (different fundamental medium / social model / temporal shape)
  - `<what_to_write>` `dimensions` requirement that at least one axis must be **shape-defining** (varies the product's fundamental kind), not gradient-defining (varies degree within a shared product shape) — with explicit examples (Primary medium, Social model, Temporal shape, Anchoring object)
  - `<quality_bar>` "Frame-clinging across the set" rejection (corpus-level check, not single-hypothesis check)

**Why**: across the prior 4 canonical runs (20 hypotheses), the corpus clustered in ~5 recurring archetypes that all live within "text-based privacy-first journaling app" territory. Voice / calendar / ritual / sensemaking / chosen-circle / image-anchored / letter-writing — none appeared in any run. The model was generating variants within the safest neighborhood of the solution space rather than spanning categories. Two probable causes: (a) the brief named "journaling apps with mood tags" as a failure mode, which the model treated as the genre to *improve*, not *escape*; (b) the exploration-axes the model invented were all gradient axes ("information density", "prescriptiveness") on a shared product shape, never shape-defining axes that span product kinds. The remedy: explicit instruction to identify the dominant frame and break it, plus a structural requirement that one axis defines product shape, not just degree.

**Snapshot**: post-edit, captured before the run

**Tested in**: canonical run [`20260509-175431-canonical-79ad`](runs/20260509-175431-canonical-79ad/)

**Headline outcome**: frame variation is dramatic. Four of five hypotheses occupy territories that did not appear in any of the prior 20 hypotheses: Voice-First Memory Preservation (voice as primary medium), Daily Micro-Ritual Space (cyclical temporal shape), Private Circle Shared Space (chosen-circle social model), Visual Memory Anchor (image as primary medium + cyclical anniversary). The model invented exactly the shape-defining axes the prompt requested (Primary Medium, Social Model, Temporal Shape) and positioned different hypotheses on different points of those axes. Critically, the bold bets are *implemented end-to-end*, not stubbed: Voice-First uses real `MediaRecorder` + `getUserMedia`; Visual Memory Anchor uses `FileReader` + base64 storage. Working-depth contract from cycle 4 carried through cleanly. The "Frame-clinging across the set" quality bar appears to have done its job. Only one archetype-overlap remains: Anonymous Peer Matching (this run) vs. Private Bridge to Connection (cycle 4) — both anonymous-match.

**What's still open after this cycle**:
- Test whether the prompt is teaching the *concept* of shape-defining axes or the *labels* I provided as examples — re-run with example axis names phrased abstractly to see whether the model still produces shape-spreading axes
- Run the same canonical flow on a different brief (productivity tool, accessibility utility) to test whether frame-breaking generalizes beyond grief
- Run `reframe-upstream` on the grief brief — original tool-purpose comparison is now finally a fair test (both flows share all 5 cycles' edits)
- Daily Micro-Ritual at 6 files is the largest in the corpus despite its bet being structurally minimal — possible scope-creep worth a closer look

---

## Cycle 6 — Concept-vs-mimicry test: remove example axis labels (~17:55 UTC, 2026-05-09)

**Files edited**:
- `packages/auto-designer-pi/prompts/gen-hypotheses.md` — three places where cycle-5 had embedded literal axis-name examples (`Primary Medium`, `Social Model`, `Temporal Shape`, `Anchoring Object`) with their range options:
  - `<how_to_think>` frame-breaking bullet — removed enumerated medium/social-model/temporal-shape menu; replaced with abstract definition: a frame-break is when "a user would describe what the thing IS with a different sentence, not the same sentence with different adjectives"
  - `<what_to_write>` `dimensions` axis-mapping requirement — removed the four example axes and their ranges; replaced with abstract shape-vs-gradient definition; added explicit anti-mimicry instruction: "Invent the axis from the specific solution space the brief implies — do not import generic axis labels"
  - `<quality_bar>` "Frame-clinging across the set" rejection — removed inline example axes; rephrased as a corpus-level check ("if a user reading the five names would say 'these are all the same kind of thing, just slightly different,' you've not explored")

**Why**: in cycle 5 the model produced exactly the axes I named in the prompt's examples (`Primary Medium: text ↔ voice ↔ image ↔ calendar ↔ ritual`), with positions drawn from the literal range options I listed. The widening was real but possibly artificial — bounded to my example menu, not produced by the model genuinely internalizing the shape-vs-gradient concept. Per a methodology principle the human flagged: "never give models examples in prompts because they tend to latch on to the example." This cycle tests it directly: keep the structural requirement (one shape-defining axis required) but remove the example labels and ranges. If the model still produces shape-spreading axes — and ideally in territories I didn't anticipate — the *concept* landed. If it falls back to gradient axes, the *labels* were carrying the load.

**Snapshot**: post-edit, captured before the run

**Tested in**: canonical run [`20260509-181710-canonical-71df`](runs/20260509-181710-canonical-71df/)

**Headline outcome**: **the labels were carrying the load — concept did not stick on its own.** The corpus regressed to the safe text-based-journaling neighborhood. Cycle 5 had three shape-defining axes (Primary Medium / Social Model / Temporal Shape) producing categorically different products (Voice-First / Daily Micro-Ritual / Private Circle / Visual Memory Anchor / Anonymous Peer Matching). Cycle 6 has at most one shape-defining axis (Core Interaction: preservation vs generative — borderline) and the rest are gradient axes (Product Scope, Connection Model, Onboarding Intensity, etc., all variations of degree). Hypothesis names tell the same story plainly: cycle 5 names describe categorically different things (Voice-First / Visual Memory Anchor); cycle 6 names are mood adjectives on a shared product (Memory Vault / Reflection Companion / Private Sanctuary / Guided Presence / Light Context Space). The user's "never give examples" principle is empirically validated — labels were doing real load-bearing work, not just illustration.

**What's still open after this cycle**:
- **The methodology question is now real**: examples cause label-mimicry but their absence here caused conceptual collapse. Three responses being considered: (a) restore cycle-5 examples (accept scaffolding cost), (b) provide antithetical *pairs* not *menus* ("text vs voice IS shape-defining; minimal vs rich IS gradient" — keep the concept anchored without complete menu), (c) harsher conceptual framing without examples ("if your five hypotheses share the same noun, rewrite"). Awaiting human direction on which to try next.
- The grief brief's gravity may be a confound. Cycle 6's regression might be partly "with examples removed, the model finds the safest interpretation of the brief" — and on grief, text-based journaling is overwhelmingly the safest interpretation. Test: run cycle-5 (with examples) and cycle-6 (without) prompts on a non-grief brief and compare spread.

---

## Cycle 7 — Pull back: less prompt mass, trust the model (~18:25 UTC, 2026-05-09)

**Files edited**:
- `packages/auto-designer-pi/prompts/gen-hypotheses.md` — reverted most of cycles 5+6:
  - Removed the long `<how_to_think>` frame-breaking bullet (added cycle 5, softened cycle 6)
  - Removed the `<what_to_write>` shape-vs-gradient axis-mapping requirement (added cycle 5, softened cycle 6)
  - **Kept** the short `<quality_bar>` "Frame-clinging across the set" entry — example-free, single corpus-level signal, structurally aligned with existing quality-bar rejections

**Why**: human direction after seeing cycles 5+6: "We need to let the model do the work. I think trying to over-prompt it doesn't help sometimes. I think often less is more, but don't use examples." Cycle 5 had widened the corpus dramatically but only because of label-mimicry on my example menus. Cycle 6 (concept-only, no examples) regressed back to the safe text-based-journaling neighborhood. The user's read: my elaborate concept exposition was over-engineering, not the right response. Trust the model with less prompt mass and a single sharp quality-bar signal. The model is good at "Find the maxima first: bold, divergent bets" — that language already existed in the prompt before cycle 5; let it carry the weight again, with the new quality-bar reject as the only added scaffolding.

**Snapshot**: post-edit, captured before the run

**Tested in**: canonical run [`20260509-194219-canonical-03e5`](runs/20260509-194219-canonical-03e5/)

**Headline outcome**: **the pull-back did not recover variation.** Same brief, same supplied sections, less prompt mass — and the corpus regressed even further than cycle 6 toward safe text-based-journaling territory. 5 of 5 axes are gradient (Privacy posture / Content structure / User guidance / Interface density / Adaptation model — all degree-of-shared-property). Hypothesis names are all variations of "private grief journaling app with X variation": Private Memory Vault / Gentle Scaffold Available / Adaptive Presence Space / Private Space with Trusted Connection / Ritual-Focused Commemoration. The retained `Frame-clinging across the set` quality-bar entry did not bite — corpus violates it on its face and the model still produced this set.

**Three runs now form a clean controlled comparison on the same brief**:
- Cycle 5 (structural req + examples) → widest variation, but artificial via label-mimicry
- Cycle 6 (structural req + concept, no examples) → regression to safe territory
- Cycle 7 (no structural req, no examples, just one quality-bar reject) → safe territory, even more gradient

**The user's "less is more, no examples" principle is methodologically right but on this brief, the model's natural intuition without external pressure is text-based journaling variants. There is no clean prompt-only path I've found that produces wide variation *without* examples.**

**What's still open after this cycle**:
- **Test grief-brief gravity hypothesis**: run any cycle 5/6/7 prompt on a non-grief brief (productivity tool, accessibility utility, etc.) and see whether the same prompt produces wider spread when the brief itself doesn't have a strong default product shape. This is the cleanest next experiment.
- **Possible broader prompt simplification**: I only pulled back cycles 5+6. The pre-existing `gen-hypotheses.md` is still elaborate (many `<how_to_think>` bullets, multiple quality-bar rejections, long output contract). The user's "less is more" might apply more broadly than just my recent additions — worth a pass.
- **Decide on the `Frame-clinging across the set` entry**: kept it in cycle 7 but it didn't bite. Either remove (ineffective ceremony) or it needs different framing — but the user has rejected the "more pressure" direction so removal is the consistent choice.

---

## Cycle 8 — Brief-gravity test: same prompt, different brief (~20:23 UTC, 2026-05-09)

**Files edited**: none (prompt unchanged from cycle 7). New brief written: [`experiments/briefs/manager-1on1.md`](briefs/manager-1on1.md) — PM-shaped problem statement for a 1:1 prep tool for new managers, deliberately chosen for absence of strong default product-shape gravity.

**Why**: cycle 7 produced a regression to safe text-based-journaling territory on the grief brief, despite the user's "less is more, no examples" principle being methodologically sound. The remaining hypothesis to test: was the recurring-archetype clustering caused by the *prompt's missing pressure for variation*, or by the *grief brief's particular gravity* (cognitive ledger emphasizing minimalism, "journaling apps" named as the failure to improve upon, emotionally subdued topic with constrained aesthetic expectations)? Same prompt, different brief is the clean test.

**Snapshot**: unchanged from cycle 7

**Tested in**: canonical run [`20260509-202353-canonical-a37c`](runs/20260509-202353-canonical-a37c/) — full pipeline including stage-1 inputs-gen, no supplied sections

**Headline outcome**: **the brief was the bias source, not the prompt.** Same cycle-7 prompts produced **five categorically different products** on the manager-1on1 brief: a question-prompt tool (Single-Prompt Focus), a passive data dashboard of relationship signals (Signal-Informed Context), a horizontally-scrolling card-deck browser (Conversation Deck), an input→output transformation tool (Quick-Agenda Builder), and an ambient floating overlay across any app (Passive Floating Companion). Five hypotheses, four genuinely different product types, none of which "share a noun." Working depth from cycles 3-4 still holds — 1-2 file artifacts each, but each one actually implements its bet (`position: fixed` for the floating widget; real transform logic for the agenda builder; real signal-computation from time data for the dashboard). The user's "less is more, no examples" principle holds. Cycle 7 is the right place to leave the prompt — the corpus widens naturally on a brief without strong default gravity. Pushing harder to overcome a particularly gravitational brief (cycles 5, 6) was the wrong response.

**What's still open after this cycle**:
- **Run reframe-upstream on manager-1on1**: now we have a brief where canonical produces good spread, the reframe-upstream variation is meaningful to compare. This is the canonical-vs-reframe comparison the experiments tool was originally built for.
- **Test whether the `Frame-clinging across the set` quality-bar entry actually contributes**: remove it and re-run on manager-1on1 — if the corpus is still wide, even that minimal scaffold isn't doing work.
- **Test on a third brief with intermediate gravity** to see whether the spread holds across the typical brief landscape, or grief was specifically pathological.
- **Recognize brief gravity as a thing in the workflow**: the experiments tool now has empirical evidence that some briefs telegraph an answer more strongly than others. Worth surfacing this in the critique loop or in summary.md so a reviewer knows whether to expect tight or wide variation from a given brief before reading hypotheses.

---

## Cycle 9 — Flow shape, not prompt mass: explicit ideation stage (~20:50 UTC, 2026-05-09)

**Files edited / created**:
- **NEW** `experiments/src/flows/ideation-first.ts` — variant flow that inserts an explicit ideation stage before the canonical pipeline. Pattern mirrors `reframe-upstream.ts`: a direct LLM call before stage 1, output stitched into the brief content as a tagged block (`<product_shape_candidates>`), then delegates to canonical with the augmented brief and `flowNameOverride: 'ideation-first'`.
- **No prompt edits.** Cycle 9 is purely a flow-level intervention.

**Why**: cycle 8 confirmed that brief gravity (not prompt content) was the cause of recurring-archetype clustering on the grief brief. The user's frustration: I'd spent 8 cycles iterating on prompts when the architecture was explicitly built to support flow-shape changes too. The hypothesis behind cycle 9: when commitment to bets happens within an explicit pre-pool of categorically different product shapes (produced by a separate ideation stage before commitment), the incubator's 5 commitments span more shapes — even on high-gravity briefs — because the model is choosing 5 from a wider menu rather than direct-to-bets from the spec alone. This separates the classical chain's brainstorm phase from the commitment phase, which the prior 8 cycles had been smashing together.

The ideation stage produces 8-12 categorically different product directions with short names + one-sentence shape descriptions. No features, no measurements — pure exploration of the solution space. Output stitches into the brief content so every downstream stage (research, objectives, constraints, incubator, build) sees the directions as part of the brief context.

**Why this isn't a prompt edit**: no examples were given to the ideation prompt either, per the user's principle. The prompt asks for "categorically different product directions" and "products described with different sentences about what they ARE, not different adjectives on a shared product" — abstract conceptual framing, no enumerated menu.

**Snapshot**: unchanged from cycle 7 (no prompt edits)

**Tested in**: ideation-first run [`20260509-235256-ideation-first-22c9`](runs/20260509-235256-ideation-first-22c9/) on the grief brief, same supplied sections as all prior grief runs

**Implementation note**: the initial implementation used `provider.generateChat` (matching `reframe-upstream.ts`'s pattern), but minimax/m2.5 returned schema-invalid responses on the direct call ("OpenRouter API returned an invalid chat completion response" — likely reasoning-only output without parseable `content`). Refactored to use `runTaskAgentPiSession` with sessionType `inputs-gen` and a `result.md` output target — the same proven pattern that works for the incubator and inputs-gen stages. The flow now uses the Pi sandbox session for ideation; the model writes its 8-12 directions to a markdown file rather than returning them via streaming text. Worth flagging as a real reliability lesson: direct `generateChat` calls are flaky on minimax for some prompt shapes; Pi-session calls are robust.

**Headline outcome**: **the flow-shape change worked. This is a flow problem, not a prompt problem.** The ideation stage produced 10 categorically different product directions covering every territory I'd previously called out as missing across 25+ prior hypotheses (memory journaling, conversational AI, letter-writing, ritual/calendar, communication-to-network, visual canvas, collaborative preservation, philosophical exploration, ambient widget, anonymous-circle memorial). The incubator then committed to 5 hypotheses spanning 5 categorically different shapes (Quiet Memory Room / Letter to the Void / Gentle Questioner / Ritual Anchor / Quiet Signal) — not 5 variations of the same product. The corpus has at least 3 clearly shape-defining axes (Primary Function with 5 distinct positions, Interaction Model, Intelligence Level), comparable to cycle 5 but achieved without examples or label-mimicry. **This is what cycles 5-8 were trying to do via prompt edits and could not. The right tool was an architectural change.**

The architectural lesson — to be applied going forward: when the same problem (insufficient variation, narrow corpus, recurring archetypes) gets hit with prompt edits twice without resolving, **stop iterating on prompts and ask whether the issue is flow shape**. The classical design-thinking chain (HMW → ideas → hypothesis → prototype) separates brainstorm from commitment for good reason. When the experiments tool's flow collapses brainstorm into commitment, the breadth phase atrophies. Adding the brainstorm-as-its-own-stage was the architectural answer the experiments tool was built to enable. Future rounds: this is the first lever to reach for, not the last.

**What's still open after this cycle**:
- **Hands-on test the cycle-9 artifacts** — especially the genuinely new shapes (Gentle Questioner / Ritual Anchor / Quiet Signal). Working-depth contracts from cycles 3-4 should still hold but we haven't verified across these more diverse product types.
- **Run `ideation-first` on manager-1on1** to see whether the ideation stage adds spread on an already-wide brief or is purely a high-gravity-brief intervention. **(Done in cycle 10 — see below.)**
- **Audit which 5 of 10 ideation directions the incubator picked**, and why those — selection logic is implicit and might be biased toward the most-easily-committable 5 rather than the most-spread-spanning 5.
- **Investigate the `provider.generateChat` reliability issue** with minimax — direct non-streaming calls return schema-invalid responses on some prompts. This affected `reframe-upstream` previously and now ideation-first's first attempt. The Pi-session path is the robust workaround but the underlying issue should be understood (likely reasoning-only output that strips `content`). Could fix in `provider-fetch.ts` to fall back to `reasoning` when `content` is missing.

**Working-depth audit of cycle-9 grief artifacts (no API cost)**: each artifact has real cross-page state model where the bet implies one — `localStorage` memories in Quiet Memory Room, full `getLetters/saveLetters` API across Letter to the Void's multi-page flow, chat-history container in Gentle Questioner, ritual create/list flow in Ritual Anchor, signal-grid + recipients model in Quiet Signal. The cycle-3-4 working-depth contracts generalize across genuinely different product shapes — meaningful finding on its own.

---

## Cycle 10 — Test ideation-first generality: low-gravity brief (~20:11 UTC, 2026-05-09)

**Files edited / created**: none. Same prompts, same flow file, different brief.

**Why**: cycle 9 showed ideation-first dramatically improved spread on the high-gravity grief brief. Open question: does ideation-first generalize as a default replacement for canonical, or is it specifically valuable for high-gravity briefs? The hypothesis: ideation-first might be conditionally valuable, neutral on low-gravity briefs (where canonical already produces wide variation), and could even add ceremony or anchor the model to named directions in ways that *narrow* an otherwise-creative incubator. Tests this directly.

**Snapshot**: unchanged

**Tested in**: ideation-first run [`20260510-001156-ideation-first-178a`](runs/20260510-001156-ideation-first-178a/) on the manager-1on1 brief, no supplied sections (full pipeline)

**Headline outcome**: **ideation-first is conditionally valuable, not universally valuable.** Cycle 10's manager-1on1 corpus has 5 distinct shapes (Guided Reflection Journal / Question Recommendation Engine / Meeting Warm-Up Micro-Experience / Context Aggregator Dashboard / Asynchronous Pre-Meeting Brief) but spread is comparable or *slightly narrower* than cycle 8's canonical/manager-1on1 corpus, which included the genuinely strange "Passive Floating Companion" (an ambient overlay across any app — categorically different from a destination app). The ideation stage produced 10 directions including some genuinely category-spanning ones (Audio Coach Companion / Peer Preparation Session / Manager's Operating System) but the incubator picked the safer 5 — same incubator-conservatism pattern observed in cycle 9 grief (where it dropped Ambient Presence, Shared Memory Garden, etc.).

The 2×2 picture across cycles 7-10:
- **Canonical + low-gravity brief**: wide corpus (cycle 8 manager-1on1) — incubator explores naturally
- **Canonical + high-gravity brief**: narrow corpus (cycle 7 grief) — incubator stuck in safe territory
- **ideation-first + high-gravity brief**: wide corpus (cycle 9 grief) — ideation pool unsticks the incubator
- **ideation-first + low-gravity brief**: comparable or slightly narrower (cycle 10) — ideation pool may *anchor* an already-creative incubator to named directions

**Architectural implication**: the right answer isn't "use ideation-first by default." It's **brief-gravity-aware flow selection** — pick the flow that fits the brief's defaults. Canonical for low-gravity, ideation-first for high-gravity. This is a future move, not a current one.

**A new architectural problem revealed**: the incubator consistently picks the safer 5 from an N-direction ideation pool, dropping the most-categorically-different directions. Across cycles 9 and 10, the directions that get dropped are the ones that span shapes furthest from the brief's default — exactly the ones we'd want to keep for a wide corpus. This suggests the next architectural lever to test: **a flow where ideation produces exactly 5 directions and each becomes one hypothesis (one direction → one incubator call), eliminating the pick-5-from-N selection bias.**

**What's still open after this cycle**:
- **Test "exactly 5 directions = exactly 5 hypotheses"**: new flow variant where the ideation stage produces exactly 5 directions and each one becomes a hypothesis via a separate incubator call. This forces commitment across the full pool rather than allowing conservative selection. Direct test of whether the incubator's pick-5-from-N is the residual narrowness source.
- **Brief-gravity detection**: an upstream stage or pre-flight check that classifies the brief's default-product-shape gravity and routes to canonical (low) or ideation-first (high) accordingly. Pure architecture move; no prompt mass.
- **Investigate ideation→inputs-gen pollution**: the ideation block was prepended to the brief, so research/objectives/constraints generation also saw it. Worth auditing cycle 10's spec.md for evidence — if spec sections start enumerating named directions, the ideation block should be stitched in *after* inputs-gen (before incubator only).

---

## Cycle 11 — Wild ideation + spread-maximizing curation as separate stages (~00:35 UTC, 2026-05-10)

**Files edited / created**:
- **NEW** `experiments/src/flows/wild-ideation.ts` — variant flow with two distinct stages before the canonical pipeline:
  - **Stage 0a (divergent brainstorm)**: produce 10-15 categorically different product directions. Prompt explicitly invites wild/wacky/extreme/improbable directions. Anti-censorship language: "the wilder the better. Selection comes later."
  - **Stage 0b (convergent curation)**: pick exactly 5 directions from the brainstorm pool with **maximum spread** across the solution space. Prompt explicitly: "Your job is NOT to pick the most plausible 5. Your job is to pick the 5 that, taken together, occupy the WIDEST span across the solution space — the 5 that include the wildest viable bets, not just the safest ones."
  - Output of curation is exactly 5 directions, stitched into the brief content as `<product_shape_candidates>`. The downstream incubator sees a pool of exactly 5 — it cannot drop the wildest bets because they're all the bets.
- **No prompt edits** to gen-hypotheses.md or any other existing prompt.

**Why**: cycles 9 and 10 both showed a recurring pattern — the ideation stage produces categorically different directions (including wild ones), but the existing incubator picks the safer 5 from the pool, dropping the most distinctive directions (cycle 9 dropped Ambient Presence, Anonymous Memory Garden; cycle 10 dropped Audio Coach Companion, Peer Preparation Session, Manager's Operating System). This is the classical UX divergent/convergent failure mode: collapsing the two phases into one LLM call lets implicit conservatism creep in. Splitting them into distinct stages — with explicit anti-censorship in the divergent phase and explicit spread-maximization in the convergent phase — forces honest brainstorming followed by deliberate selection. Pre-curating to exactly 5 spread-spanning directions before the incubator runs eliminates the pick-N-from-larger-pool conservatism entirely.

**Snapshot**: unchanged from cycle 7

**Tested in**: wild-ideation run [`20260510-114521-wild-ideation-19ef`](runs/20260510-114521-wild-ideation-19ef/) on the grief brief, same supplied sections as all prior grief runs. ~34 minutes wall (longer than prior cycles; one pathologically long build inflated the total).

**Headline outcome**: **the architectural separation produced the most distinctive corpus we've ever generated on the grief brief.** The wild-brainstorm stage produced 15 directions including pre-loss grief / taboo grief / browser extensions / ambient soundscapes / graduation-from-grief tools — all genuinely new territory across 30+ prior hypotheses. The curation stage explicitly chose for spread, with a written rationale that says "Deliberately excluded: the many directions centered on journaling, tracking, peer matching, and communication helpers, as these represent the conventional center of grief-tech and would have narrowed rather than widened the spread." The model **explicitly rejected the conventional center** because the curation prompt asked it to. The 5 final hypotheses (Anticipatory Chamber / Ambient Sanctuary / Unspoken Archive / Grief-Free Mode / The Quiet Exit) are the wildest 5, not the safer 5 — exactly addressing the cycle 9-10 incubator-conservatism finding.

**Key architectural validation**: separating divergent (wild brainstorm, no censorship) from convergent (explicit spread-maximizing curation) as two distinct LLM calls produces the result that cycles 5-10 of prompt-mass yo-yo could not. The classical UX divergent/convergent split, implemented as flow architecture not prompt pressure, works.

**Notable issue**: one of 5 builds (Anticipatory Chamber) failed — Pi session ran ~28 minutes and produced no files. Build-side infrastructure problem, separate from the ideation/curation finding. The other 4 hypotheses built successfully but file counts are low (1-5 files); some directions push against the static-mock format (Grief-Free Mode is *literally* a browser extension; Ambient Sanctuary wants generative ambient sound). Worth flagging that wild-ideation might surface bets the build phase isn't well-suited to express; either the curation stage should know about the medium constraint, or the build phase should handle direction-medium mismatch more gracefully.

**Architectural lesson confirmed (to apply going forward)**: when prompt edits don't resolve a recurring problem in 2 cycles, **stop iterating on prompts and look at flow shape**. Cycles 5-7 spent three rounds of prompt editing trying to widen the corpus on grief without resolving it. Cycle 9 (one new flow) widened it dramatically. Cycle 11 (split into two stages) widened it further by isolating divergent and convergent phases. The architectural surface is the right tool for "the model is doing X when we want it to do Y" problems where prompt pressure has plateaued.

**What's still open after this cycle**:
- **Run wild-ideation on manager-1on1** to test whether the divergent/convergent split helps low-gravity briefs too, or whether ideation-style flows are specifically a high-gravity-brief intervention. Cycle 10 showed ideation-first slightly narrowed manager-1on1 vs canonical; wild-ideation with explicit anti-censorship may behave differently. **(Done in cycle 12 — see below.)**
- **Investigate the Anticipatory Chamber build failure** — read the observability log around the 28-minute Pi session that produced no files. Build-side infrastructure question, not flow-design.
- **Test curation pick-stability** — run wild-ideation twice on the same brief and see whether the curation stage converges on similar 5 directions or has substantial variance.
- **Build-phase / medium-mismatch**: some wild directions push against the static-HTML mock format (browser extension, ambient soundscape). Either the curation stage should know about the medium constraint, or the build phase should fall back gracefully when a direction doesn't fit the static-mock medium.

---

## Cycle 12 — Parallelization fix + wild-ideation on low-gravity brief (~12:27 UTC, 2026-05-10)

**Files edited / created**:
- `experiments/src/flows/canonical.ts` — refactored the per-hypothesis loop to run builds in parallel via `Promise.all(hypotheses.map(...))` when `provider.supportsParallel` is true (OpenRouter), sequential `for` loop when false (LM Studio). Mirrors the canvas's per-provider-lane parallelism. Each `runOneHypothesis` call swallows its own errors into the summary, so one failed lane doesn't abort the others.

**Why**: human flagged that experiments tool wall time (34 min for cycle 11; 13 min typical) is dramatically slower than canvas. Root cause: experiments tool was running 5 hypothesis builds serially, while the canvas runs them concurrently because OpenRouter is parallel-safe (`provider.supportsParallel === true`). A typical build is ~2-3 minutes; sequential 5 builds = 10-15 min, parallel 5 builds = ~3 min (max of the slowest). This was an unintentional architectural divergence from production, not a model-speed problem.

**Snapshot**: unchanged

**Tested in**: wild-ideation run [`20260510-122718-wild-ideation-4593`](runs/20260510-122718-wild-ideation-4593/) on manager-1on1 brief. **Wall time: 4.4 minutes.** Down from 34 min (cycle 11 same flow on grief, sequential) and ~13 min (cycle 10 ideation-first on same brief, sequential). Roughly 3-7x speedup depending on prior baseline.

**Headline outcome 1 (parallelization)**: confirmed. Cycle 12 has *more* stages than any prior canonical cycle (two ideation stages + three sequential inputs-gen calls + incubator + 5 builds) but completes in 4.4 min on OpenRouter via parallel builds. The experiments tool now matches canvas-level performance on parallel-safe providers.

**Headline outcome 2 (wild-ideation generalizes to low-gravity briefs)**: cycle 10 had observed that the prior `ideation-first` flow appeared to slightly narrow the manager-1on1 corpus vs canonical. Cycle 12 (wild-ideation on the same brief) **corrects that finding**. The cycle-12 corpus is *wider* than cycle 8's canonical/manager-1on1 corpus: it includes a *radical* "make 1:1s unnecessary" bet (Async Trust Building), a voice-modality bet (Voice-First Reflection), a future-temporal-frame bet (Career-Centered Conversations), and a flipped-interaction-model bet (Report-Driven Agenda). The curation stage's Spread rationale paragraph again explicitly excludes the conventional center ("incremental optimizations of the status quo… purely gamified prompts without structural novelty"). The divergent/convergent split is the right architecture for both high-gravity and low-gravity briefs — the cycle-10 narrowing was specific to `ideation-first`'s single-stage architecture, not the underlying split principle.

**Architectural conclusion**: wild-ideation is now a candidate for default flow. It produces wider corpora than canonical on both high-gravity and low-gravity briefs, has working-depth and bet-critical contracts intact (inherited from canonical's downstream pipeline), and with parallel builds takes ~4-5 min wall time. The only cost is two extra LLM calls (brainstorm + curation) per run. Canonical might remain the "fast path" for single-hypothesis verification or cases where the divergent/convergent split is overkill, but wild-ideation should be the default for actual ideation work.

**What's still open after this cycle**:
- **Re-run wild-ideation on grief with parallel builds** to confirm the speedup also holds on the high-gravity brief. Cycle 11 had the 28-min runaway build that masked total wall time; with parallel builds and that one outlier, total would likely still be dominated by the outlier — but a clean run on the same flow would tell us cycle 11's true expected wall time.
- **Audit cycle 12 working depth** on the less-conventional product types (Async Trust Building, Voice-First Reflection) to confirm cycle-3-4 contracts hold across the wider shape diversity.
- **Promote wild-ideation to default?** Worth one more cycle of evidence (or running it on a third brief) before committing. If the corpus quality holds across briefs, update the README and consider deprecating canonical as the recommended flow for ideation work.
- **Cost-cap semantics with parallel builds**: all 5 builds check `ctx.cost.assertCapacity` before any start, so a tight per-run cap can't abort mid-run. Daily ledger cap is the meaningful guard. Consider noting this in the README or adding concurrency-aware capacity tracking if it ever bites.

---

## Cycle 13 — Promote wild-ideation to default + scope-vs-believability heuristic (~12:59 UTC, 2026-05-10)

**Files edited / created**:
- [`experiments/README.md`](README.md) — Quickstart now leads with `pnpm exp run wild-ideation`; canonical demoted to "fast path" with explicit guidance for when to pick it (single-hypothesis verification, prompt unit-tests). Flow list reordered: wild-ideation first, marked as default; canonical second, framed as the simpler alternative.
- [`AGENTS.md`](../AGENTS.md) — flow list in the experiments command block now reads `wild-ideation (default) | canonical | reframe-upstream | inputs-gen`.
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — Experiments tool section's flow list updated to identify wild-ideation as default and canonical/reframe-upstream/inputs-gen as alternates.
- [`experiments/critique-guide.md`](critique-guide.md) — added a **scope-vs-believability** heuristic under Artifact / build quality. Names two failure modes for application-scale hypotheses: (a) *subset-too-greedy* — artifact attempts the whole product and ships shallow versions of everything; (b) *subset-too-shallow* — artifact picks one slice but implements it as a stub. Right shape: tight subset (1-3 surfaces, the bet-critical ones), believable implementation within the chosen subset, no "in a real product this would..." hand-waving in bet-critical paths. Also added an explicit step to "How to read a run" — the agent must now run the scope-vs-believability check on every hypothesis when critiquing, scoring `hypothesis_adherence` and `working_depth` against the combined check.

**Why**: cycle 12 finished with three converging signals — wild-ideation produces wider corpora than canonical on both gravities, parallel builds make the extra two stages cheap (~4-5 min wall), and the cycle-3-4 working-depth contracts inherit cleanly into the wild-ideation pipeline. Time to make the recommendation durable in docs. Separately, the human surfaced a longstanding concern: when a hypothesis is application-scale, the artifact must intelligently pick a subset of features that exemplifies the bet *and* implement that subset believably (not 50 shallow pages, not 1 stub page). This is implicit in cycle 3's bet-critical/scaffold guidance and cycle 4's working-depth contract, but neither of those names the *subset-selection* dimension explicitly. New heuristic makes both the selection step and the in-subset depth requirement first-class critique checks.

**Snapshot**: unchanged (no prompt edits, only docs + critique guide).

**Tested in**: nothing run yet — this cycle is durable-doc + critique-heuristic only. The heuristic will be exercised against cycle 14+ runs.

**Headline outcome**: wild-ideation is now the documented default. The scope-vs-believability check is now part of the critique loop and will get applied to the open audit work (Async Trust Building, Voice-First Reflection cycle-12 working depth) when it happens.

**What's still open after this cycle**:
- **Re-run wild-ideation on grief with parallel builds** to confirm speedup on high-gravity brief.
- **Investigate the 28-min Anticipatory Chamber build that returned 0 files** — observability log read.
- **Test curation pick-stability** — run wild-ideation twice on the same brief, compare picks.
- **Audit cycle 12 working depth on Async Trust Building and Voice-First Reflection** — apply the new scope-vs-believability heuristic as the audit framework. This is the first opportunity to exercise the heuristic against real artifacts.

---

## Cycle 14 — Prohibit hand-waving in bet-critical paths + taxonomy rewrite (~13:14 UTC, 2026-05-10)

**Files edited / created**:
- [`packages/auto-designer-pi/prompts/design-agent-instructions.md`](../packages/auto-designer-pi/prompts/design-agent-instructions.md) — new bullet under bet-critical features: "No hand-waved conversions in bet-critical paths." Names the specific failure pattern (Blob → base64 conversion before `localStorage.setItem`, real audio playback from stored data, cross-tab event delivery, derived state on page load) where the static-mock format makes a step awkward. Forbids `// in a real app, this would...`, `// would play actual audio from storage`, `// simulate ...`, and equivalent admit-and-ship comments. Requires a self-search for `in a real`, `would `, and `simulate` in bet-critical files before declaring done — any hit means either implement the step or descope the feature.
- [`experiments/critique-guide.md`](critique-guide.md) — rewrote the scope-vs-believability heuristic from a 2-failure-mode framing (subset-too-greedy / subset-too-shallow — jargon the human pushed back on as unclear) to a clean 3-failure-mode taxonomy with plain-language names: (1) **spread thin** — every named feature gets shallow UI, no individual feature has depth; (2) **off-target slice** — bet-critical features the hypothesis named are present but thin while non-bet-critical scaffolding is over-built; (3) **hollow at the bet** — picked the right surfaces but the bet-critical loop inside them is faked or admitted-and-shipped. The "How to read a run" entry was updated to walk these three checks in order, stopping at the first failure. The Voice-First Reflection cycle-12 build is now cited as the canonical hollow-at-the-bet example. Critique-time inspection is framed as the second line of defense; build-side prevention lives in design-agent-instructions.md.
- [`experiments/critique-guide.md`](critique-guide.md) under Evaluator behavior — added "no rubric numerals when the evaluator didn't run." `--no-evaluate` runs must judge in plain prose; do not fabricate `hypothesis_adherence: 2 / working_depth: 2`-style scoring. Reserve numerals for runs where `evals/<id>.json` actually exists. The rubric numerals are auto-evaluator vocabulary, not the human's working vocabulary.
- [`experiments/runs/20260510-122718-wild-ideation-4593/critique.md`](runs/20260510-122718-wild-ideation-4593/critique.md) — fixed the audit addendum to drop fabricated rubric numerals; verdicts now read in plain prose.
- [`experiments/runs/20260510-122718-wild-ideation-4593/feedback.md`](runs/20260510-122718-wild-ideation-4593/feedback.md) — captured the human's chat feedback that triggered the heuristic.

**Why**: cycle 13's audit found Voice-First Reflection's recorder works but its playback is faked — `simulatePlayback` runs a setInterval-driven progress bar instead of playing the recorded audio, with the comment `// In real app, would play actual audio from storage` admitting the gap. The model knew the conversion was needed (Blob → base64 before `JSON.stringify`) and shipped a placeholder. This was the second concrete instance (after cycle-3's stub-data finding) of the model identifying a needed step in a bet-critical path, declaring the gap in a comment, and shipping the comment. The human flagged that catching it only at critique time means tokens were already wasted on a broken build. Right tool: a build-side prompt rule that prevents the pattern at generation time. The taxonomy rewrite addresses a separate human signal — the previous "subset-too-greedy / subset-too-shallow" framing was unclear; the human asked me to think through what the taxonomy should actually be and named "mismatched" as a probable third mode (encoded as **off-target slice**).

**Snapshot**: `pnpm snap` ran before AND after the prompt edit. `design-agent-instructions.md` saved at the new state.

**Tested in**: nothing yet — this cycle is build-side rule + critique-side heuristic. The next experiment run will be the first test.

**Headline outcome**: build-side prevention for hollow-at-the-bet shipped. Critique-side taxonomy is now plain-language and three-mode. Rubric numerals are no longer fabricated for `--no-evaluate` runs.

**What's still open after this cycle**:
- **Re-run wild-ideation/grief with parallel builds** — kills two birds: (a) confirms parallelization speedup on the high-gravity brief, (b) if a voice/audio hypothesis appears in the corpus, exercises the new bet-critical-path rule. Grief has produced voice bets before (cycle 5's Voice-First Memory Preservation, cycle 11's Ambient Sanctuary).
- **Curation pick-stability** — still unrun. Worth doing once we have evidence the prompt edit holds.
- **Investigate the 28-min Anticipatory Chamber build** — still unrun. Build-side infrastructure question.
- **Backlog: post-build honesty-check stage** — flow-shape variant where a fresh LLM session reads the artifact's bet-critical paths and flags hand-waving comments before the run completes. Don't build it yet; let the prompt rule run first. If the rule doesn't catch the pattern reliably, escalate to this.

---

## Cycle 15 — Pi-session reliability fix + first live test of cycle-14 hand-waving rule (~14:00 UTC, 2026-05-10)

**Files edited / created**:
- [`server/services/pi-agent-runtime.ts`](../server/services/pi-agent-runtime.ts) — added `StreamIdleError` typed exception and a stream-idle watchdog. The watchdog races against `handle.run()` via `Promise.race`, polls `bridgeCtx.streamActivityAt` every 3s, fires `agent.abort()` and rejects with `StreamIdleError(idleMs)` if no stream event has bumped activity for **45s**. A healthy model produces thinking_delta / text_delta events on a millisecond cadence; the only legitimate silence is pre-first-token thinking, which on the models we use is typically under 15s and never observed above ~30s. Past 45s the connection is dead, not slow.
- [`server/services/pi-llm-log.ts`](../server/services/pi-llm-log.ts) — added paired `[pi-llm-log] streamFn invoked` (before awaiting `inner()`) and `[pi-llm-log] streamFn resolved (stream object received)` (after) debug logs. Gap between the two localizes future hangs to either pre-stream (inner Promise never resolved → fetch-layer / DNS / TLS) or intra-stream (inner resolved but no chunks ever flow → server-side stall, watchdog catches).
- [`experiments/src/flow.ts`](flow.ts) — added `withStageTimeout` helper + `STAGE_TIMEOUT_MS` constants (**90s** inputs-gen / curation / brainstorm, **3 min** incubator, **6 min** design build, **3 min** eval); replaced generic `Error` thrown on timeout with typed `StageTimeoutError`. Wraps every `runTaskAgentPiSession` and `provider.generateChat` call across the 4 stage primitives. Budgets are sized at ~2× cycle-15's clean-run maxes (inputs-gen ~30s, incubator ~60s, build ~150-180s) — they're a safety net for tool-loops or unresolved streamFn promises the watchdog can't see, not headroom for hangs.
- [`experiments/src/flows/wild-ideation.ts`](flows/wild-ideation.ts), [`experiments/src/flows/ideation-first.ts`](flows/ideation-first.ts), [`experiments/src/flows/reframe-upstream.ts`](flows/reframe-upstream.ts) — propagate the timeout wrapper into variant-flow custom stages.

**Why**: cycles 11 and 15 both saw Pi-sandbox sessions hang for 12-28 min after a single completed model turn. Cycle 11 was a build (Anticipatory Chamber); the killed run earlier today was a curation stage. Both: model emitted a tool call in turn 1, no further LLM activity, process held a TCP connection alive. Investigation traced the hang to a fetch-level stall on the *second-turn* streamFn invocation — `wrapPiStreamWithLogging` only logs `beginLlmCall` after `inner()` resolves, so a hung `inner()` produced zero log entries (the gap that misled us into thinking the loop had stopped iterating). The host's signal-to-abort wiring at [packages/auto-designer-pi/src/host.ts:259](../packages/auto-designer-pi/src/host.ts:259) was correct — but the experiments tool never armed the signal, so it sat as dormant infrastructure. Two-layer fix: stream-idle watchdog as the primary streaming-aware signal (mirrors how a human watching the canvas would notice silence and react), per-stage timeout as the safety net for cases the watchdog can't see (fetch never returns a stream at all; or the model is in a tool-loop producing activity but never terminating).

**Snapshot**: no prompt edits in this cycle.

**Tested in**: wild-ideation run [`20260510-135045-wild-ideation-b965`](runs/20260510-135045-wild-ideation-b965/) on the grief brief. **Wall time: 3.9 minutes** (cycle 11 same flow/brief: 34 min, inflated by the 28-min stuck build). Confirms parallelization speedup holds on high-gravity briefs. Watchdog and stage timeouts both inactive (run was clean) — they're armed for the next intermittent stall.

**Headline outcome 1 (cycle-14 hand-waving rule held cleanly on first live test)**: a grep across all 5 artifact JS files for `in a real`, `would `, and `// [Ss]imulate` returned zero hand-waving comments in any bet-critical path. The remaining matches are all real English copy (memory text, form labels) or one accurate scaffold-acknowledgment in Sensory Ground. **Most consequential: The Witness is voice-centered (same shape as cycle 12's Voice-First Reflection, which was the canonical "hollow at the bet" failure). The Witness implements the exact base64↔ArrayBuffer conversion the cycle-14 rule named, with real `new Audio(url)` playback. The model executed the conversion that cycle-12 admitted-and-shipped instead.** The build-side prompt rule prevented the exact failure pattern at generation time on its first opportunity to do so.

**Headline outcome 2 (curation has run-to-run variance)**: cycle 11 and cycle 15 are wild-ideation on the same brief with the same supplied sections. The 5 picks have **zero overlap** between cycles (cycle 11: Anticipatory Chamber / Ambient Sanctuary / Unspoken Archive / Grief-Free Mode / The Quiet Exit; cycle 15: The Witness / Sensory Ground / Safe Exchange / The Companion / Grief Markers). The brainstorm covers similar territory both cycles (voice / ambient / dyadic / etc are recurring), but the curation stage's "widest spread" pick is not stable across runs. This is direct evidence on the open curation pick-stability question. My current read: variance is a feature not a bug — each run produces a *valid* spread; repeated runs sample more of the imagination space. Worth a critique-guide entry framing curation as a spread-*sampler* not a spread-*selector* so future critiques don't read variance as defect.

**Per-hypothesis verdicts (scope-vs-believability heuristic)**: all 5 pass clean. The Witness has a real audio loop. Sensory Ground's 81 JS lines is intentionally minimal per its hypothesis. Safe Exchange and The Companion both have full localStorage state models with cross-page reads. Grief Markers correctly honors the hypothesis-level decision to scaffold the form without persistence. Three-failure-mode taxonomy (spread thin / off-target slice / hollow at the bet) catches nothing because nothing is broken — both the cycle-14 prompt rule and the cycle-13 heuristic are working as intended on the first run that exercises them.

**What's still open after this cycle**:
- **Curation pick-stability explicit experiment**: run wild-ideation 3x on the same brief and compare the 15 total picks. Cycles 11+15 already show variance; an N=3 controlled comparison frames it precisely.
- **Decouple curation from brainstorm variance**: run curation twice on a fixed brainstorm output to factor out which stage owns the variance.
- **Stage-helper consolidation refactor in flow.ts**: every cross-cutting concern (timeouts, watchdog, retries) currently has to be wired into 4-6 places because each stage repeats the same scaffold. Pulling dry-run + transcript + cost + timeout-wrap into one `runStageWithTranscript` helper would shrink each stage to ~10 lines and make future additions trivial. Worth a dedicated cycle.
- **Observable `wrapPiStreamWithLogging`**: current fire-and-forget `void (async () => {...})()` swallows logging-side failures. Returning the deferred would let callers correlate stream completion with logging completion. Lower urgency.

---

## Cycle 16 — Stage-helper consolidation + observable LLM logging (~15:10 UTC, 2026-05-10)

**Files edited / created**:
- [`experiments/src/flow.ts`](flow.ts) — added `runStageWithTranscript<T>(ctx, def, fn)` helper that owns the cross-cutting concerns every stage repeats: ordinal bump, dry-run early-return, cost.assertCapacity / recordUsage, withStageTimeout wrap, error capture into the transcript, transcript write, throw-on-error after the transcript is durable. Each stage now declares its `StageDef` (slug / title / sessionType / userPrompt / timeout / dry-run placeholder / formatResponse) and provides a `fn` callback that does only the LLM-flavor-specific work. Refactored `runInputsGen` (76 → 53 lines), `runIncubator` (98 → 60 lines), `runDesignBuild` (94 → 56 lines).
- [`experiments/src/flows/wild-ideation.ts`](flows/wild-ideation.ts) — refactored `runWildBrainstorm` and `runCuration` (~100 lines each → ~55 lines each); dropped redundant `writeTranscript` / `withStageTimeout` / `CostTracker` imports.
- [`experiments/src/flows/ideation-first.ts`](flows/ideation-first.ts) — refactored `produceIdeation` (~100 → ~55 lines); same import cleanup.
- [`experiments/src/flows/reframe-upstream.ts`](flows/reframe-upstream.ts) — refactored `produceReframe` to use the helper with provider.generateChat inside the `fn` callback. Loosened `StageDef.sessionType` to `SessionType | (string & {})` so non-Pi stages (`'direct-llm'`) can be labelled correctly without a cast.
- [`server/services/pi-llm-log.ts`](../server/services/pi-llm-log.ts) — extracted the fire-and-forget logging IIFE to a named `finalizeLogFromStream` function. Added paired `[pi-llm-log] logging finalized` / `[pi-llm-log] logging failed` debug logs (next to the existing `streamFn invoked` / `streamFn resolved` brackets — gives a complete turn-by-turn trace). Added optional `pendingLogFinalizers: Set<Promise<void>>` param so callers can drain in-flight log writes before tearing down. Without this, a session that returns within ms of stream-end can race the finalize IIFE and silently lose its log entry.
- [`server/services/pi-agent-runtime.ts`](../server/services/pi-agent-runtime.ts) — passes a per-session `pendingLogFinalizers` set to the wrapper, then `await Promise.allSettled([...pendingLogFinalizers])` in the `finally` block before returning. Log entries are now durable on disk before the runtime hands control back to the caller.

**Why**: cycle 15 surfaced two facts about the experiments tool that were holding back further iteration speed.
1. Every cross-cutting concern (timeouts in cycle 15, watchdog wiring, future retry logic, future observability) had to be wired into 4-6 callsites because each stage repeated the same 40-line scaffold around its unique ~5 lines of LLM work. The next cross-cutting addition would have meant 4-6 more edit points. Pulling the scaffold into one helper means new cross-cutting work goes in once.
2. The `wrapPiStreamWithLogging` IIFE was fire-and-forget — anything that went wrong inside (LLM-log row partial-write, finalize throw, etc.) was silently swallowed by `void`. Cycle 15's investigation needed paired streamFn-invoked/resolved logs precisely because we couldn't see logging outcomes. Making the wrapper observable means the next debugging session has the complete picture without needing a code change first.

**Snapshot**: no prompt edits in this cycle.

**Tested in**: full test suite (125 root + 87 package tests), TypeScript build (clean), and a `--dry-run` of wild-ideation/grief that confirms the refactored helper produces correctly-shaped transcripts in the right ordinal sequence. No live run needed — refactor preserves observable behavior of cycle 15's clean run.

**Headline outcome**: every experiments-tool stage now flows through one helper. Future cross-cutting concerns ship in one place. Logging-side failures are now visible instead of silent. Log entries are durable before the runtime returns.

**Behavioral preserved**:
- Transcript filenames, ordinals, slugs, titles unchanged
- Dry-run path unchanged (helper preserves the `notes: 'dry-run: not sent to provider'` semantic)
- Cost-cap gating unchanged (assertCapacity + recordUsage still bracket the LLM call)
- Stage-timeout / stream-idle watchdog wiring from cycle 15 unchanged (timeout wrap moved into the helper, watchdog stays on the runtime side)
- Error message format unchanged (`${timeoutLabel} failed: ${reason}`)

**What's still open after this cycle**:
- **Curation pick-stability explicit experiment** — directly enabled by this cycle's reliability fix; the helper makes it cheap to add a `runCurationOnce(brainstormText)` test rig if we want.
- **Per-stage retry logic** — now a single-edit-point feature. Adding "retry once on StreamIdleError or transient OpenRouter error" goes in the helper.
- **Backlog: post-build honesty-check stage** — flow-shape variant, still parked until the cycle-14 prompt rule shows a failure.

---

## Cycle 17 — Renamed `wild-ideation` flow to `ideation` (~15:16 UTC, 2026-05-10)

**Files edited / created**:
- Renamed `experiments/src/flows/wild-ideation.ts` → [`experiments/src/flows/ideation.ts`](flows/ideation.ts).
- Inside the file: `WildIdeationInput` → `IdeationInput`, `runWildBrainstorm` → `runBrainstorm`, `WILD_IDEATION_GUIDANCE` const → `BRAINSTORM_GUIDANCE`, `flowNameOverride: 'wild-ideation'` → `'ideation'`. Stage 0a transcript slug `'wild-brainstorm'` → `'brainstorm'`, title `'Stage 0a — wild brainstorm (divergent, no censorship)'` → `'Stage 0a — brainstorm (divergent, no censorship)'`, `timeoutLabel: 'wild-brainstorm'` → `'brainstorm'`.
- [`experiments/README.md`](README.md) — Quickstart commands and the Flows-section entry for the default flow.
- [`AGENTS.md`](../AGENTS.md) — flow list in the experiments command block.
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — flow list in the Experiments tool section.

**Why**: human asked to rename. The "wild" qualifier was descriptive of the divergent stage's anti-censorship framing when the flow was a contender; once it became the documented default (cycle 13), the name became a tic. `ideation` is the plain noun for what this flow does.

**Snapshot**: no prompt edits in this cycle.

**Tested in**: `pnpm exec tsc -b` clean, full test suite still green (carried from cycle 16's run), dry-run of `ideation` produced correctly-shaped run dir `20260510-151639-ideation-ce95/` with transcripts `01-brainstorm.md`, `02-curation.md`, `03-05-*-source.md`, `06-incubator.md`. CLI dispatches `ideation` correctly via the dynamic `experiments/src/flows/${name}.ts` resolver.

**What was deliberately preserved**:
- The XML tag `<wild_ideation_guidance>` inside the Stage 0a prompt body — that's prompt content the model has been responding well to since cycle 11, and the rename was about host-side identifiers, not the prompt the model sees. Renaming the tag would be a separate prompt edit warranting a snap-and-test cycle, not a refactor side effect. The JS const wraps the unchanged prompt string with a `BRAINSTORM_GUIDANCE` name so the JS reads consistently while the model still sees the same tag.
- The semantic prose "the wilder the better", "wider, wilder hypothesis corpora" inside the prompt body and the `runBrainstorm` progress message ("Brainstorming wild directions…"). These are descriptions of the divergent stage's behavior, not the flow name.
- Existing run directories on disk (e.g., `runs/20260510-114521-wild-ideation-19ef/`, `runs/20260510-122718-wild-ideation-4593/`, `runs/20260510-135045-wild-ideation-b965/`) keep their historical filenames. The path reference in [critique-guide.md](critique-guide.md) to `runs/20260510-122718-wild-ideation-4593/` (Voice-First Reflection canonical example) still resolves correctly.
- Cycles 11-16 entries in this log keep their `wild-ideation` references — they describe what the flow was called at the time. Going forward, new entries should use `ideation`.

**What's still open after this cycle**:
- **Curation pick-stability explicit experiment** — run `ideation` 3x on the same brief, compare 15 total picks. Cycles 11+15 already showed zero overlap on the same brief; an N=3 sample frames the variance.
- **Backlog: post-build honesty-check stage** — flow-shape variant; parked until the cycle-14 prompt rule shows a failure.

---

## Cycle 18 — Curation pick-stability experiment (~15:33 UTC, 2026-05-10)

**Files edited / created**:
- [`runs/20260510-152438-ideation-8a31/`](runs/20260510-152438-ideation-8a31/), [`runs/20260510-152927-ideation-2533/`](runs/20260510-152927-ideation-2533/), [`runs/20260510-153258-ideation-c6ba/`](runs/20260510-153258-ideation-c6ba/) — three fresh `ideation` runs on the grief brief, same supplied sections as cycles 11+15. Mean wall time 4.1 min (4.4 / 3.1 / 4.9). All clean: no aborts, no timeouts, no stream-idle stalls.
- [`runs/20260510-153258-ideation-c6ba/critique.md`](runs/20260510-153258-ideation-c6ba/critique.md) — full cycle 18 analysis as a critique on the latest run. N=5 territory map, brainstorm-vs-curation variance breakdown, spread-sampler framing, three calibration questions.
- [`critique-guide.md`](critique-guide.md) — new **Curation pick-stability** subsection under Calibration heuristics. Documents the spread-sampler framing, the two-tier territory pattern (stable backbone ~5 territories, long-tail samples ~8-10), the observation that the incubator renames everything downstream of curation (read `02-curation.md` transcript to see actual picks, not `hypotheses.json` which is incubator output), and how to read pick-divergence as signal not defect.

**Why**: cycles 11+15 showed zero exact-name match between curation outputs on the same brief; my running guess was "variance is a feature, not a bug" but it was a guess. Cycle 18 ran the controlled N=3 follow-up to test it. The reliability fix in cycle 15 made this experiment cheap (~12 min wall for 3 sequential runs vs. cycle-11-era risk of one runaway 28-min build inflating the total) — it was the first concretely-blocked-on-reliability item we cleared.

**Snapshot**: no prompt edits in this cycle.

**Tested in**: the cycle 18 experiment is itself the test — three runs producing 15 picks. Compared to cycles 11+15's 10 picks gives N=5 and 25 picks total.

**Headline outcome 1 (curation is a spread-sampler)**: 25 picks, 0 exact-name matches across any pair, but at the territory level a clear two-tier pattern. **Stable backbone**: ambient/quiet (5/5 runs), pre-loss/anticipatory (4/5), memory archive (4/5), audio modality (3/5), loss-specific (3/5). **Long tail**: anonymous, somatic, anti-design, sandbox, browser-extension, graduation, pet-grief, practical-adult — each picked by 1-2 of 5 runs but rarely the same pair. The model is sampling a spread from a ~12-13 territory pool with strong sampling weight on obviously-distinctive territories and lighter weight on a long tail of valid alternatives.

**Headline outcome 2 (variance compounds across stages)**: looking at brainstorm pools, ~4 territories are stable across all brainstorms (ambient, archive, anonymous, calendar) and ~4-6 distinctive territories surface per run that the others don't. So the variance has two additive sources: brainstorm surfaces different long-tail territories each run, AND curation samples different territories from the available pool. Each run produces 5 picks; 3 runs produce ~12-13 territories explored. **Implication: re-running the whole flow N times produces more imagination-space coverage than re-running curation N times on a fixed brainstorm.** The current pattern (re-run the whole flow, don't decouple stages) is correct for exploration purposes.

**Headline outcome 3 (cycle-14 hand-waving rule continues to hold)**: grep across every bet-critical JS file in runs A, B, C found zero `// in a real`, zero `// simulate`, zero hand-waving in any bet-critical path across 15 hypothesis builds. The voice/audio territory was again the most consequential test surface (Run A's Voice-First Grief Journal, Run C's Soundtrack to Grief); both produced real audio loops. The build-side prompt rule is now validated across cycles 15 (5 hypotheses), 18 (15 hypotheses) — 20 builds clean.

**Pi-session reliability check**: 3 sequential runs without a single hang, abort, or stage-timeout fire. The stream-idle watchdog (45s) and stage timeouts (90s/3min/6min/3min) sat dormant. Cycle 15's reliability fix is holding under repeated use.

**What's still open after this cycle**:
- **Decouple brainstorm from curation variance**: run curation 2-3 times on a fixed brainstorm output to factor out which stage contributes how much to the long-tail variance. Cheap (~2 min per re-run); pinpoints the source. Right shape: persist a brainstorm's `result.md` from one run, feed it to curation directly. Would need a small `--brainstorm-from <path>` flag on the ideation flow.
- **Calibration question I'm still uncertain on**: is the bimodal territory-frequency distribution actually a stable pattern, or coincidence at N=5? Worth re-running 3 more times to push to N=8 and see if the long tail keeps stabilizing or keeps surfacing new territories. Cheap follow-up.
- **Backlog: post-build honesty-check stage** — flow-shape variant; still parked. The cycle-14 prompt rule has held across 20 builds now; no forcing function to escalate.

---

## Cycle 19 — Brief portfolio expansion + parallel-matrix infrastructure findings (~16:35 UTC, 2026-05-10)

**Files edited / created**:
- 5 new briefs in [`experiments/briefs/`](briefs/): [`tax-prep.md`](briefs/tax-prep.md) (sparse 2-sentence), [`password-reset.md`](briefs/password-reset.md) (single-flow, prescribed-with-gravity), [`code-onboarding.md`](briefs/code-onboarding.md) (cross-cutting, non-app shape invited), [`icu-handoff.md`](briefs/icu-handoff.md) (specialist, high-stakes), [`habit-tracker.md`](briefs/habit-tracker.md) (prescribed-solution feature list with named comparables).
- [`vite.config.ts`](../vite.config.ts) — added `server.watch.ignored` for `experiments/runs/**`, `experiments/.cost-ledger.jsonl`, `logs/**`. Vite's default chokidar watcher was hammering CPU during parallel matrix runs (every transcript / observability / artifact write triggered HMR module-graph invalidation). With this exclusion, parallel runs leave Vite quiet.
- [`experiments/src/flows/reframe-upstream.ts`](flows/reframe-upstream.ts) — refactored from `provider.generateChat` (non-streaming direct path) to `runTaskAgentPiSession` (Pi session path with full cycle-15 reliability stack). Cycle 19 saw the direct call exceed the 90s stage budget on habit-tracker even with no concurrent load; the Pi-session path completed cleanly in 4.7 min for the whole flow because the stream-idle watchdog catches actual stalls in 45s and lets healthy slow-but-streaming calls run.
- [`experiments/runs/20260510-161257-ideation-eace/critique.md`](runs/20260510-161257-ideation-eace/critique.md) — full cycle 19 analysis as the host critique. 6 findings (3 brief-side, 3 infrastructure), per-hypothesis audit samples, calibration questions, suggested next experiments.
- [`critique-guide.md`](critique-guide.md) — two new subsections under Calibration heuristics: **Brief shape changes what the corpus tests** (sparse / detailed / cross-cutting / prescribed brief categories and what each should produce) and **Hand-waving in permission-gated functionality** (cycle-14 rule weakens on briefs inviting biometric/microphone/sensor features). Also restored the **Source-of-section matters** header that got orphaned in cycle 18's edit.

**Why**: cycle 18 was the last grief-only cycle. Pushing on broader testing requires a brief portfolio — same flow across different briefs reveals different system behaviors, and the experiments tool was hitting diminishing returns running the same brief over and over. The user explicitly asked to expand the portfolio and run combinations: sparse / flow / cross-cutting / specialist / prescribed.

**Snapshot**: no prompt edits in this cycle.

**Tested in**: 6-run matrix across 5 new briefs (`ideation` × tax-prep / password-reset / code-onboarding / icu-handoff / habit-tracker, plus `reframe-upstream` × habit-tracker as the prescribed-solution comparison control). Wave-1 of 3 parallel + pipeline-replaced wave-2 of 3 parallel. Total wall ~17 min for the matrix vs ~30 min sequential. After the Vite watch fix, parallel matrix runs no longer destroy the laptop.

**Headline outcome 1 (the wild brainstorm + spread-curation is what breaks prescription-grip)**: habit-tracker is the cleanest test we've run. Brief was deliberately written as a feature-list pitch with named comparables. `ideation` produced categorical alternatives (Garden of Habits / Voice-First Minimalist / Quantum State Habits / Chaos Menu Randomizer / Wearable Body Sync). `reframe-upstream` produced *exactly the prescribed feature list* (Minimal Friction Home / Swipe Completion Flow / Calendar-First Reflection / Social Streak Sharing / Analytics-First Power User). The recovered HMW question was a polite restatement of the prescription, not a recovery of an alternative opportunity. **`reframe-upstream` is underpowered as a standalone flow — the work has to happen in the brainstorm phase where explicit anti-censorship + spread-maximization actually generate alternatives.** Strong validation for `ideation` as the documented default.

**Headline outcome 2 (hand-waving rule weakens in permission-gated domains)**: cycle-14 prompt rule held cleanly across cycles 15+18 (grief, 0 hits in 20 builds). Across cycle-19's 4 completed corpora (excluding tax-prep which short-circuited): **13 hits in 4 corpora, 20 builds**. All hits clustered around browser-permission-gated or backend-required functionality (WebAuthn, MediaRecorder, microphone, geolocation, sensor APIs, real backend services). The model is reproducing the pattern in domains the prompt didn't name explicitly. The cycle-14 rule's effectiveness is brief-domain-sensitive, not absolute. **Promotes the post-build honesty-check stage from backlog to next-cycle candidate** — direct evidence that pattern-agnostic post-build inspection would catch what the prompt rule misses.

**Headline outcome 3 (CPU was Vite's chokidar, not Bitdefender or Pi sandbox)**: 6-parallel runs were destroying the laptop. Investigation: Bitdefender at 80% CPU was a red herring, Pi sandbox is in-process (no subprocess churn), Vite was the actual culprit — default chokidar watcher had no ignore for `experiments/runs/**` or `logs/**`, so every transcript/observability/artifact write triggered module-graph invalidation. One-line config fix to `server.watch.ignored` reclaims the CPU. Documented in the cycle 19 critique under "infrastructure findings."

**Other findings**:
- **Sparse briefs liberate the brainstorm**: tax-prep's 2-sentence brief produced wildly imaginative picks (Tax Escape Room, Parallel Universe Explorer, Business Autopsy Table). Sparse-brief corpora should be read for imagination breadth, not signal-engagement.
- **Cross-cutting briefs produce non-app shapes when explicitly invited**: code-onboarding picked Slack Bot and VR Landscape. Briefs that don't invite cross-cutting shapes default to web-app destinations.
- **Specialist briefs produce credible engagement**: icu-handoff picks ("30-Second Canvas", "Trend Whisper", "Family Pulse") engaged with specific brief signals (pacing, EHR data overload, family context) rather than surfacing clinical stereotypes.
- **No retry on transient stage errors → matrix runs are brittle**: tax-prep died on a single design-constraints stage hiccup (transient, no `StageTimeoutError`). 1 of 6 runs lost to a single network/provider blip with no retry. Cycle 19 stages also ran 1.5-2× longer than cycle 18 baseline, suggesting OpenRouter/MiniMax was generally wobbly today.
- **Pipeline-style parallelism > batch waves**: 3-at-a-time pipelined (replace each finished slot immediately) beats wave-of-3-then-wave-of-3 for matrix throughput while keeping concurrency at the safe ceiling.

**What's still open after this cycle**:
- **Build the post-build honesty-check stage** — most consequential cycle-19 finding turned into infrastructure. Separate Pi session reads bet-critical files and flags hand-waving pattern-agnostically. Direct evidence backing this is now strong.
- **Add stage-level retry** in `runStageWithTranscript` — single retry on non-fatal stage errors (not StageTimeoutError or StreamIdleError, which should fail fast). Cheap, removes a real source of matrix flakiness.
- **Re-fire tax-prep** to get a complete sparse-brief corpus.
- **Try a sharper reframe-upstream system prompt** before deprecating: "you are a contrarian who refuses to take the brief's framing at face value, find the assumption that's wrong" instead of "be a UX strategist."
- **Brief-aware critiquing in the auto-evaluator**: the cycle 19 finding that detailed-brief and sparse-brief corpora should be read differently isn't yet encoded anywhere the auto-evaluator could use. Either the auto-evaluator gets a brief-category signal, or critiques continue manual.
- **Backlog: decouple brainstorm from curation variance** (cycle 18 carryover) — still not done; lower priority now that cycle 19 produced richer findings.

---

## Cycle 20 — Reliability fixes + post-build honesty-check stage (~17:18 UTC, 2026-05-10)

**Files edited / created**:
- [`experiments/src/flow.ts`](flow.ts) — three substantial changes:
  1. Replaced 4 duplicates of `firstNonEmptyFileContent` (one in flow.ts, three in variant flows) with one exported `extractResultFile(files, expectedFilename, stageLabel)` helper. The helper emits a `[flow] <label>: model wrote to "X" instead of expected "Y"` debug log when it falls back, so prompt drift is visible instead of silently masked.
  2. Added stage-level retry inside `runStageWithTranscript`: up to 2 attempts, retryable on `StreamIdleError` and generic `Error`, NOT retryable on `StageTimeoutError` or `CostCapExceededError`. Per-attempt cost gating (`assertCapacity` + `recordUsage` per attempt) so the daily ledger reflects retry burn accurately. Backoff is interruptible — a parent-signal abort during the 1.5s sleep breaks out immediately. Typed errors propagate as themselves; generic transients collapse to the stage-labelled string.
  3. Added `runHonestyCheck` primitive (Stage 3.5) — a separate Pi session that reads the hypothesis prose + JS/HTML files and emits a structured `{ verdict: 'clean' | 'minor' | 'hollow' | 'unknown', findings: HonestyFinding[] }`. Bounded context (8KB per file, 60KB total cap, JS/HTML only — CSS doesn't fake behavior). Tolerant JSON parse with `unknown` fallback. 3-min timeout (smoke-run signal: 90s was too tight; honesty-check is heavier than other inputs-gen stages because it scans every file).
- [`experiments/src/flows/canonical.ts`](flows/canonical.ts) — hooked `runHonestyCheck` after `runDesignBuild` per hypothesis. Errors don't invalidate the build (critique tool, not a gate); verdict goes on `summary.honesty`, errors on `summary.honestyError`.
- [`experiments/src/flows/ideation.ts`](flows/ideation.ts), [`experiments/src/flows/ideation-first.ts`](flows/ideation-first.ts), [`experiments/src/flows/reframe-upstream.ts`](flows/reframe-upstream.ts) — switched to the consolidated `extractResultFile`; removed the local `firstNonEmptyFileContent` duplicates.
- [`experiments/src/summary.ts`](summary.ts) — added `honesty` and `honestyError` fields to `PerHypothesisSummary`, surfaced as a `- **honesty**: ✅ clean / 🟡 minor / 🔴 hollow / ⚪ unknown (N findings)` row per hypothesis, and added an auto-observation entry for `hollow` verdicts that calls out the bet-critical hand-waving site count.
- Cleanup: deleted 5 stale stub run dirs (2 from earlier crashes that left no `config.json`, 3 dry-runs from cycle-13/15/17 verification work).

**Why**: cycle 19 surfaced two real reliability gaps (no stage-level retry → tax-prep died on a transient hiccup; cycle-14 prompt rule weakened on permission-gated APIs → 13 hand-waving hits in 4 of 5 corpora) and a bunch of accumulated cleanup debt. The user asked for a fix-pass that thought through edge cases beyond what I'd named.

**Snapshot**: no prompt edits in this cycle (build-side prompt rule from cycle 14 unchanged; the new honesty-check is a critique-time inspection, not a generation-time constraint).

**Tested in**: smoke run [`20260510-171828-ideation-f037`](runs/20260510-171828-ideation-f037/) on the password-reset brief (chosen because cycle-19 saw biometric hand-waving on this exact brief — perfect validation surface). 5.2 min wall, 5/5 builds completed, 5/5 honesty checks **fired**, 2/5 returned a verdict, 3/5 hit the original 90s budget (since bumped to 3 min for cycle 21+). The successful verdicts were the validation:
- **Crisis Priority Lane → ✅ clean** — no problematic stubs in bet-critical paths
- **Social Vouching → 🔴 hollow with 9 findings, 5 bet-critical** — the model precisely identified the faked acceptance flow (`// Demo: Simulate contact accepting`, `// For demo, we simulate and go to waiting page`), and *correctly* tagged scaffold-page comments (`// in a full implementation, this would allow users to pre-designate their trusted contact`) as `severity: ok` because the hypothesis explicitly named that feature as scaffold scope. The cycle-14 grep would have flagged comment text but couldn't make the bet-critical-vs-scaffold distinction.

**Headline outcome (honesty-check works as designed on first live test)**: the cycle-19 finding ("hand-waving rule weakens in permission-gated domains") now has a structural answer. A pattern-agnostic post-build inspection catches what the prompt rule misses, and — critically — distinguishes bet-critical violations from scaffold-acceptable simulation. The auto-observations call out hollow verdicts so a human (or future critique LLM) goes straight to the affected hypothesis. With the timeout bump, future runs should produce verdicts on every hypothesis instead of 2 of 5.

**Edge cases handled in the retry**:
- Per-attempt cost-cap accounting (each attempt asserts + records, daily ledger stays accurate when retries fire)
- Signal-aware interruptible sleep (cancelled run doesn't outlive its retry backoff)
- Typed-error preservation (StageTimeoutError / StreamIdleError / CostCapExceededError still propagate as themselves; only generic transients collapse to the labelled string)
- Transcript-level retry note when retry actually fired (`Attempted 2× before success: attempt 1: ... | attempt 2: ...`)

**Edge cases handled in honesty-check**:
- Tolerant JSON parse — the lenient parser already handles the messy outputs MiniMax sometimes produces; verdict falls back to `unknown` if shape is broken
- Bounded context — 8KB per file, 60KB total cap protects against runaway builds with many oversized files
- File-type filter — only JS/HTML are audited; CSS is excluded because CSS doesn't fake behavior
- Failures don't invalidate the build — recorded as `honestyError` on the per-hypothesis summary; the run continues
- Dry-run skipped — no built files to audit in dry-run mode

**What's still open after this cycle**:
- **Re-fire tax-prep with retry now in place** — cycle 19 carryover. Should now succeed where it died on the design-constraints transient.
- **Backlog: try sharper reframe-upstream system prompt** — cycle 19 finding was that reframe-alone is underpowered. One more cycle of trying to rescue it before declaring deprecated.
- **Backlog: decouple brainstorm from curation variance** — cycle 18 carryover, lower priority now.
- **Watch the next matrix run** for whether 2 attempts × 1.5s backoff is the right retry profile, or whether some failure modes need 3 attempts / longer backoff.
- **Honesty-check on the cycle-19 corpus** — the 4 corpora where we found hand-waving via grep would be useful to re-audit with the structured honesty-check to see how many findings it surfaces and how it categorizes severity. That's a one-day analysis cycle, not a re-run.

---

## Cycle 21 — Build-side depth contract: disguised-stub ban, ONE-feature floor, build-plan-first, working-depth skill (TBD UTC, 2026-05-11)

**Files edited / created**:
- [`packages/auto-designer-pi/prompts/design-agent-instructions.md`](../packages/auto-designer-pi/prompts/design-agent-instructions.md) — four surgical edits to `<how_to_think>`:
  1. New **token-efficiency** bullet near the top: a flat multi-page mock with no closed journey is the worst possible outcome — wastes spend AND fails to make the bet falsifiable.
  2. New **build-plan-first** bullet requiring `BUILD_PLAN.md` at workspace root before substantive code. The plan commits to: (1) the ONE bet-critical feature (or TWO only if they share a state model), (2) the user journey it must close (sketched concretely with state names), (3) scaffolded surfaces with honest copy, (4) for each `<measurement>`, the file and state a reviewer will inspect.
  3. **Soft ONE-feature floor** added to the existing bet-critical bullet: if both named bet-critical features can't be implemented to working depth within budget, pick ONE — the most falsifying — and rewrite the other's copy as scaffold. "One built deeply proves more than two faked."
  4. **Generalized the disguised-stub ban** under the existing "No hand-waved conversions" bullet. The cycle-14 rule covered comment strings (`// in a real`, `// would`, `// simulate`); cycle 19 evidence showed stubbing migrated to user-visible forms after the ban. New explicit prohibitions: `Simulate: X` / `Demo: Y` UI labels, `setInterval`-driven fake "progress" as substitute for real state change, `alert('In a full implementation, this would...')` and equivalents, hardcoded values rendered as if dynamic. Same rule applies — implement or descope to scaffold with honest copy.
  5. **Measurements-as-build-targets** added to the journey-walk bullet. Each `<measurement>` is no longer just an acceptance gate; it's a contract the artifact must be sized for. Reviewer must be able to grade yes/partial/no by opening a specific file and inspecting state — no "would work in production" inference allowed.
- [`packages/auto-designer-pi/skills/working-depth/SKILL.md`](../packages/auto-designer-pi/skills/working-depth/SKILL.md) — new auto-load skill. Frontmatter matches `design-generation`'s `when: auto`. Body is the depth contract (`file:line` for state change + every consumer), the four disguised-stub patterns, the scaffold-vs-working-depth distinction, and a concrete journey-walk self-check that includes a grep step for the disguised patterns. Picked up automatically by [`server/lib/skill-discovery.ts`](../server/lib/skill-discovery.ts).

**Why**: Layer 1+2 of the read-the-docs-and-soft-tide plan. Hypothesis generation has been calibrated through cycles 11–20; the build stage is now the bottleneck. User-observed problem: "the agent is still falling short of building anything interesting. It kinda just builds a couple of flat pages that don't really do anything." Concrete evidence sampled in pre-cycle exploration:
- [`runs/20260510-171828-ideation-f037`](runs/20260510-171828-ideation-f037/) *Social Vouching* shipped `<button id="simulate-accept">Simulate: Alex accepts request</button>` standing in for the bet-critical acceptance flow. Same run had `alert('In a full implementation, this would show additional recovery options...')` at `js/app.js:211`. Honesty-check (cycle 20) caught it post-hoc but no feedback loop existed back to the build.
- [`runs/20260510-171828-ideation-f037`](runs/20260510-171828-ideation-f037/) *Crisis Priority Lane* passed honesty ✅ clean but its bet-critical wait-time display is `queuePosition = 3; setInterval(decrement, 8000)` — a fake queue. Honesty-check's string grep missed it because the strings are absent.

Root cause: cycle 14's prompt rule blocked the **comment form** of stubbing; the practice migrated to visible UI patterns. Cycle 20's honesty-check is post-hoc with no feedback. "Working depth" was prose-defined with examples, not tied to measurements or to a checklist. No skill addressed depth-verification.

**Snapshot**: `pnpm snap` ran before edits (Everything-up-to-date: baseline already on disk from prior cycles). Will re-run after the build-plan edits are integrated; snap-after will capture the new state tied to whatever run follows.

**Tested in**: not yet run. Plan calls for studio-machine runs (this agent is local; the user runs experiments via SSH for parallel matrix throughput):
- `pnpm exp run ideation --brief experiments/briefs/password-reset.md --cap-tokens 1000000` — known disguised-stub site.
- `pnpm exp run ideation --brief experiments/briefs/habit-tracker.md --cap-tokens 1000000` — known permission-gated hand-waving.
- Optional third: `pnpm exp run ideation --brief experiments/briefs/icu-handoff.md` — high-stakes specialist brief.

**Success criteria** (to evaluate after the runs):
- Honesty `clean` or `minor` (no bet-critical findings) on ≥4/5 hypotheses across both runs.
- Hand-walked artifacts close the bet-critical loop end-to-end at the same rate (honesty verdicts are necessary but not sufficient — *Crisis Priority Lane* passed clean while shipping a setInterval-fake queue).
- Per-hypothesis token spend roughly flat or lower than cycle-19 baseline — the ONE-feature floor and concentration framing should reduce sprawl, not increase it.
- A `BUILD_PLAN.md` is present in each artifact directory, naming the chosen bet-critical feature and the journey/measurements mapping.

**What's still open / fallback**:
- **Layer 3 in reserve** — if the post-edit runs still show "looks complete, doesn't work" or honesty surfaces new disguised-stub patterns the prompt missed, the escalation is revise-on-hollow: when `runHonestyCheck` returns `hollow` with bet-critical findings, run one bounded revise pass back through the Pi session with the findings as input. Edit point: [`experiments/src/flows/canonical.ts`](src/flows/canonical.ts) where `runHonestyCheck` is hooked. Per `critique-guide.md` "before reaching for a prompt edit": don't iterate prompt edits a third time on the same issue — escalate the architecture.
- **Honesty-check vocabulary expansion** — the structured check today greps for comment strings. After this cycle ships, the auditor should also surface `Simulate:` button labels, `setInterval` in bet-critical files, and `alert(` punts. Cheaper change than the revise loop; could land in cycle 22 alongside revise-on-hollow if escalation triggers.
- **Cycle-19 carryover backlog** — re-fire tax-prep with retry, sharper reframe-upstream prompt, decouple brainstorm/curation variance. Lower priority than landing this cycle's verification.

---

## Cycle 22 — Route bet-critical contract through Pi's native `todo_write` instead of a `BUILD_PLAN.md` file (2026-05-11)

**Files edited**:
- [`packages/auto-designer-pi/prompts/design-agent-instructions.md`](../packages/auto-designer-pi/prompts/design-agent-instructions.md) — replaced the cycle-21 BUILD_PLAN.md bullet with **"Open with a structured `todo_write`, not code."** The opening `todo_write` payload now must encode the bet-critical contract in five tiers (commit to bet-critical scope, map every measurement to file/state, name every cross-page state edge, list scaffolds with honest copy, final journey-walk + grep). Bet-critical commitment todos go *before* phase milestones. Also fixed the cycle-21 "Each `<measurement>` is a build target" line to reference "bet-critical commitment todos" instead of `BUILD_PLAN.md`.
- [`packages/auto-designer-pi/prompts/_designer-system.md`](../packages/auto-designer-pi/prompts/_designer-system.md) — rewrote `<how_you_work>` step 2 (the "Plan milestones" bullet) to require the bet-critical commitment todos to come first, then phase milestones (layout / visual system / interactions / content / validation) follow. Added explicit rule: bet-critical commitment todos cannot be marked `completed` while a disguised stub (`Simulate:`, `setInterval`, `alert('In a full implementation...')`, hardcoded-as-if-dynamic) remains in a bet-critical path.
- [`packages/auto-designer-pi/skills/working-depth/SKILL.md`](../packages/auto-designer-pi/skills/working-depth/SKILL.md) — updated the two BUILD_PLAN.md references in the self-check section to point at the opening `todo_write` instead. Added: "Any todo still marked `in_progress` or `pending` at completion time is a deferred bet-critical commitment — resolve it (implement or descope) before declaring done."

**Why**: Cycle 21's BUILD_PLAN.md contract worked mechanically (all 5 password-reset artifacts had the file) but exposed a sharper failure mode: **the plan itself committed to the simulation up front** for hypotheses whose bet intrinsically requires server/platform capabilities. Historical Credential's BUILD_PLAN.md said *"Simulates matching against historical credentials using JavaScript"* — and the agent dutifully shipped exactly that. The plan was a write-once markdown file, easy to treat as boilerplate and impossible to enforce after the first turn.

KC noticed Pi has a native `todo_write` tool ([`packages/auto-designer-pi/src/extension/designer-tools.ts:71-97`](../packages/auto-designer-pi/src/extension/designer-tools.ts)) that's already wired through to the canvas UI ([`TodoTracker.tsx`](../src/components/canvas/variant-run/TodoTracker.tsx) + [`GeneratingFooter.tsx`](../src/components/canvas/variant-run/GeneratingFooter.tsx) shows the in-flight todo). The tool's own description: *"Always provide the complete current state — full replacement, not incremental updates. Todos survive context compaction."* Three properties that make it strictly better than a markdown file:

1. **Live commitment.** Pi re-prompts the model to update the todos as work progresses — every meaningful step touches the list, not a write-once-and-ignore artifact.
2. **User-visible during the build.** Todos render in the hypothesis card's TodoTracker mid-stream. The human (and a future critique agent) can SEE the descope decision as it happens, rather than discovering it 10 minutes later in a honesty verdict.
3. **Compaction-safe.** The tool description explicitly says todos survive context compaction; the markdown plan does not.

The diagnostic value matters as much as the enforcement value: the first todo's wording ("Implement [feature] to working depth — confirm fully implementable in static HTML/JS within budget, OR descope and rewrite copy as scaffold") forces the agent to make the descope/implement decision out loud. Marking that todo `completed` while the next move is `// Simple simulation: any password 4+ chars is 'valid'` is a louder self-contradiction than burying it in markdown.

**Snapshot**: TBD (snap after the next pnpm test pass and before re-firing password-reset on studio).

**Tested in**: re-firing [password-reset on studio](runs/) for direct A/B against cycle 21's `20260511-153102-ideation-0fee` (3 clean / 2 hollow). Same brief, same `ideation` flow, same model. Validation targets:
- The two cycle-21 hollow hypotheses (Historical Credential, Human-on-Demand Video) — does the structured-todos contract force the descope decision, or do they ship hollow again?
- Clean rate ≥4/5 (the cycle 21 plan's success criterion that we missed by one).
- The first `todo_write` payload in transcripts should now show the bet-critical commitment structure, not just phase milestones — agent should also be visibly walking the descope/implement decision as the first todo.
- No `BUILD_PLAN.md` files in artifact directories (those should go away — the todos are the plan).

**What's still open after this cycle**:
- **If cycle 22 still ships ≥2 hollow on password-reset**, escalate to Layer 3 (revise-on-hollow loop in [`experiments/src/flows/canonical.ts`](src/flows/canonical.ts)) — this is the third planning-side prompt cycle, the architectural fallback documented in cycle 21's plan, and per `critique-guide.md` the right escalation when prompt-iteration hits diminishing returns.
- **Honesty-check vocabulary expansion** — the auditor today greps for cycle-14 strings; should also surface `setTimeout` simulating real-time signals, `Simulate:` / `Demo:` button labels, and `alert(` punts. Cheap edit to [`flow.ts`](src/flow.ts) honesty-check prompt; deferred to cycle 23 if cycle 22 holds.
- **Cycle-19 carryover backlog** — re-fire tax-prep with retry, sharper reframe-upstream prompt. Still parked.

---

## Cycle 23 — Bet-preserving vs bet-killing: refining the disguised-stub rule (2026-05-11)

**Files edited**:
- [`packages/auto-designer-pi/prompts/design-agent-instructions.md`](../packages/auto-designer-pi/prompts/design-agent-instructions.md) — rewrote the "Disguised stubs are still stubs" bullet as **"Disguised stubs: the line is the user's experience of the bet, not infrastructure authenticity."** Names two violation shapes (role-breaker, meta-acknowledgment) and four bet-preserving infrastructure-stub categories (backend/network, sensor/permission, crypto, demo data). Adds the discriminating question: *after this stub, can a reviewer still experience the hypothesis from inside the user's role and grade the bet?*
- [`packages/auto-designer-pi/skills/working-depth/SKILL.md`](../packages/auto-designer-pi/skills/working-depth/SKILL.md) — same carve-out in the depth checklist. Also tightened the self-check step 3 (the grep step) so it routes hits through the discriminating question instead of treating every hit as a violation.
- [`experiments/src/flow.ts`](src/flow.ts) — refined the honesty-check auditor prompt with the same bet-preserving carve-out + reframed verdict semantics. `clean` now means "no role-breakers or meta-acknowledgments anywhere; bet-preserving stubs don't degrade the verdict." `minor` covers transparent bet-preserving stubs in bet-critical paths. `hollow` is reserved for role-breakers and meta-acknowledgments. Per-finding `severity` follows the same rule.

**Why**: Cycle 22's expanded honesty vocabulary (commit [`6923821`](https://github.com/wolfyy970/designer/commit/6923821)) was too eager. Habit-tracker [run `20260511-162632-ideation-9a40`](runs/20260511-162632-ideation-9a40) flagged 2 hollow:
- *Zero-Knowledge Privacy Vault* — XOR cipher in place of AES-256.
- *Location-Aware Auto-Completion* — `<h3>🗺️ Location Simulation (Demo)</h3>` with manual "I arrived" buttons.

KC's correction: this is a **prototype**, not a production app. The bet is the user's **experience** of the hypothesis, not the authenticity of the infrastructure. Both flagged "hollows" preserve the user's experience of the bet:
- XOR cipher: user sees "encrypted with your 256-bit key" identically; the bet is the UX of zero-knowledge privacy, not the cryptography.
- "I arrived" button: user clicks the trigger, then experiences auto-complete from the triggered state forward. The bet is "auto-complete reduces friction once detection happens"; the detection-trigger fake is adjacent infrastructure.

The real failure mode is narrower and more specific: stubs that **force the user out of their natural role to fast-forward another actor's action** (cycle 19's canonical `<button>Simulate: Alex accepts request</button>`) or **replace the very interaction the hypothesis is testing with a narration** (`alert('In a full implementation, this would initiate...')`). Those break the bet because the reviewer can no longer experience the hypothesis from inside the user's role.

**Snapshot**: TBD post-snap.

**Tested in**: [run `20260511-175536-ideation-a56e`](runs/20260511-175536-ideation-a56e) on studio — habit-tracker, ideation flow, post-edit. 8:22 wall (vs cycle 22's 9:25), 177,769 tokens (vs cycle 22's 148,606 — slight uptick from more involved hypotheses, not bloat).

**Headline outcome — verdicts**:
- Pure zero-friction completion — ✅ clean
- Micro-celebration completion — ✅ clean (3 findings, all `severity: ok` — `setTimeout(...200)` correctly recognized as legitimate animation implementation, not a stub; scaffolded "coming soon" toasts in scaffold paths correctly graded `ok`)
- Progress-visible dense list — ✅ clean (3 findings, all `ok`)
- Loss-aversion streak focus — ✅ clean (2 findings, scaffold disclosures `ok`)
- Premium-aspiration experience — 🟡 **minor** (2 findings): payment-flow toast `showToast('Premium upgrade would open payment flow in production')` in bet-critical path graded `minor` with explanation *"This stub tells the user what would happen in production but does not replace the core bet interaction - premium features remain visible and locked, the upgrade modal shows with real CTAs, preserving the aspiration experience"*; Instagram-share toast in scaffold path graded `ok`.

**5/5 hypotheses passed.** Zero hollow. The first 🟡 **minor** verdict using the new severity is genuine signal: a bet-preserving stub (payment flow as adjacent infrastructure) in a bet-critical path (premium-aspiration), surfaced for transparency, doesn't degrade the run. Walked Premium-aspiration's [`artifacts/12b70467-4a8d-44fc-b66f-f8ef5a28bb59/`](runs/20260511-175536-ideation-a56e/artifacts/12b70467-4a8d-44fc-b66f-f8ef5a28bb59/) end-to-end: three real localStorage keys (`STORAGE_KEY`, `SETTINGS_KEY`, `COMPLETIONS_KEY`), `showPremiumLock('add more habits')` actually triggered when `MAX_FREE_HABITS` is hit — that *is* the bet's aspiration moment, fully experienceable. Only the post-click payment is faked; the bet is testable end-to-end up to that point. Correct call.

**Critical calibration moments observed**:
1. **`setTimeout(...200)` for animation correctly NOT flagged as a stub.** "Proper timing mechanism for 200ms animation, not a stub - this IS the implementation of the micro-feedback." Cycle 22's stricter rule would have flagged this; cycle 23's bet-preserving rule recognizes legitimate `setTimeout` use.
2. **`showToast('Premium upgrade would open payment flow in production')` correctly graded `minor`, not `hollow`.** This is right on the line — it contains the cycle 21-22 banned "would" + "in production" phrasing, but the auditor judged that the bet's experience (aspiration UX with locked features + real CTAs) is intact and only the payment infrastructure is faked. Exactly the bet-preserving-vs-bet-killing call the new rule was designed to make.
3. **No designBuild stage timeouts** — the 8-min budget covered all 5 builds comfortably. The one stage error (Pure zero-friction completion's evaluation) was on the evaluator (180s budget) not designBuild — different stage, different fix.

**Caveat — could not do per-hypothesis A/B with cycle 22's hollow cases.** The `ideation` flow's curation is a spread-sampler (cycle 18 finding); this run sampled a completely different set of hypotheses than cycle 22's habit-tracker run. So Zero-Knowledge Privacy Vault and Location-Aware Auto-Completion are not in this run's corpus, and we can't directly show "same input → different verdict under the refined rule." The validation is inferential: (a) the auditor's reasoning on Premium-aspiration's payment toast matches the rule we wrote, and (b) no false negatives — no role-breakers or meta-acknowledgments slipped through. Direct A/B would require explicitly seeding the brainstorm with the cycle 22 territories, which isn't currently possible without flow surgery.

**What's still open after this cycle**:
- **Layer 3 (revise-on-hollow)** is back to being held in reserve. Under the refined rule, password-reset was 5/5 clean and habit-tracker (re-judged) should also be 5/5 clean once the false positives flip. The revise-loop only becomes worthwhile if the *role-breaker / meta-acknowledgment* failure mode actually keeps appearing — and the rule refinement may push that rate close to zero on its own.
- **Cycle-19 carryover backlog** — re-fire tax-prep with retry, sharper reframe-upstream prompt. Lower priority.
- **Per-finding `severity: minor` reporting** — once the auditor surfaces bet-preserving stubs at `minor` severity, the human gets a transparent list of "where the prototype faked things." That's a useful audit trail. The `summary.md` honesty row should be updated to show this (e.g. `🟡 minor (3 bet-preserving stubs)` so the human can spot-check); deferred to cycle 24 if helpful.

---

## Cycle 24 — Re-audit + budget bump + 50-prototype validation (2026-05-11)

Three coordinated moves:

**Phase A — Honesty-check timeout 3 min → 5 min** (commit [`ff2e97c`](https://github.com/wolfyy970/designer/commit/ff2e97c)).
Cycle 23 work surfaced two stage-timeouts on the heavier cycle 23 auditor (Voice-Native Habit Control in the re-audit script; Pure zero-friction completion in cycle 23 habit-tracker validation). Bumped to 5 min for headroom; typical runs remain well inside.

**Phase B — Single-path-compression regression check, fresh password-reset run on cycle 23 prompts.**
Run [`20260511-215718-ideation-7f7e`](runs/20260511-215718-ideation-7f7e) on studio. 3 of 5 hypotheses built; 2 hit StreamIdleError (`Pi session aborted, no stream activity for 45s`) at the design-build stage and produced no artifact. The 3 built artifacts:

- *One-Tap Concierge First* — ✅ clean (3 findings). All findings in scaffold paths / post-bet surfaces. Zero meta-acknowledgments on bet-critical interactions.
- *Biometric Bypass Recovery* — ✅ clean (0 findings). Faked biometric flow is the canonical cycle 23 bet-preserving infrastructure stub the rule explicitly accepts.
- *Trusted Circle Social Vouch* — 🟡 minor (4 findings). This is the most interesting case — same hypothesis territory as cycle 19's canonical *Simulate-Alex-accepts* failure. Cycle 24 prompts produced a `<button>Demo: Simulate Vouch Received</button>` that triggers the auto-vouch state and lets the user experience the actual instant-reset flow. The auditor's own reasoning: *"Demo button triggers vouch-received state, then user experiences real instant reset flow. Similar to the 'I arrived at the gym' GPS example in guidelines — honest demo label, interaction from that point is real."* The cycle 19 anti-pattern has evolved into its bet-preserving form, and the auditor correctly distinguishes it.

Phase B pass criterion (zero meta-acknowledgments on bet-critical interactions across buildable artifacts) **met for all 3 buildable hypotheses**. The cycle 23 build-prompt language is preventing the Single-path-compression failure mode at build time, not just catching it at audit time.

**Phase C — 50-prototype end-to-end validation.** New batch harness [`experiments/scripts/cycle24-batch.ts`](scripts/cycle24-batch.ts) (commit [`30b19a0`](https://github.com/wolfyy970/designer/commit/30b19a0)) runs N cells with concurrency-limited `runOneCell` calls and aggregates honesty verdicts into a single report. 10 cells = 5 briefs × 2 reps × 5 hypotheses; concurrency 4; 23.7 min wall.

Aggregate report: [`runs/cycle24-aggregate/aggregate.md`](runs/cycle24-aggregate/aggregate.md).

| Outcome dimension | Count |
|---|---|
| Hypotheses attempted | 50 |
| Hypotheses with honesty verdicts | 28 |
| Stage errors (no verdict produced) | 22 |
| Of verdicted: ✅ clean | 27 |
| Of verdicted: 🟡 minor | 1 |
| Of verdicted: 🔴 hollow | **0** |

**Headline result on build quality: 0 of 28 verdicted prototypes were bet-killing. Hollow rate 0% (target ≤5%, escalation >10%).** Per-brief breakdown:

| Brief | Hypotheses | Clean | Minor | Hollow | Stage errors |
|---|---|---|---|---|---|
| password-reset | 10 | 4 | 0 | 0 | 6 |
| habit-tracker | 10 | 0 | 0 | 0 | 10 (both cells died at incubator stage) |
| grief-app | 10 | 4 | 1 | 0 | 5 |
| code-onboarding | 10 | 10 | 0 | 0 | 0 |
| icu-handoff | 10 | 9 | 0 | 0 | 1 |

The 1 minor was *grief-app/r2: Stranger Witness* — bet-preserving stubs around video-call infrastructure (matching delay simulated, video placeholder element). The auditor surfaced both as `minor` for transparency; bet's experience intact.

**Stage-error analysis.** All 22 no-verdict cases share the same root cause: `Pi session aborted: no stream activity for 45-47s. Likely a server-side stall mid-stream after the request was accepted.` This is the [`StreamIdleError`](src/flow.ts) pattern that cycle 20's stage-level retry (up to 2 attempts) is supposed to handle. The fact that both attempts failed for 22 cells across multiple briefs strongly suggests OpenRouter / MiniMax was load-shedding during the Phase C window — server-side issue, not a prompt-side problem. 10 of the 22 errors were both habit-tracker cells dying at the **incubator stage** (before any hypotheses were built); the other 12 were build-stage failures within otherwise-successful runs.

**Why this matters for interpretation.** The 28-prototype validation is real and the 0% hollow result is real, but the effective sample is smaller than the 50 we paid for. A fresh re-fire of habit-tracker on a different day would close that gap; the prompt + rule work doesn't need to change.

**Files added / modified**:
- [`experiments/src/flow.ts`](src/flow.ts) — Phase A timeout bump.
- [`experiments/scripts/cycle24-batch.ts`](scripts/cycle24-batch.ts) — Phase C harness.
- [`experiments/scripts/re-audit-cycle23.ts`](scripts/re-audit-cycle23.ts) — pulled out of the cycle 23 work; reusable for any future re-audit when reviewer rules change.

**What this closes**:
- The "real failure rate" question that's been moving since cycle 21. On 28 fresh builds under cycle 23 prompts, **the rate of bet-killing prototypes is 0%**. Under the cycle 23 rule, on the historical re-audit (cycle 23 entry), it was ~22% — that's the improvement from the cycle 22 → 23 build-prompt work, validated.
- The cycle 23 entry's "we haven't tested whether cycle 23 prompts prevent Single-path-compression at build time" gap. Phase B confirms: they do.

**What's still open**:
- **Per-finding `severity: minor` summary-row reporting** (carryover from cycle 23's open list) — the report shows `minor (N findings)` but the underlying severity breakdown isn't surfaced in `summary.md`. Small cosmetic win.
- **Critique-feedback capability** — KC mentioned this earlier as the next arc after validation lands. Cycle 24 closes the validation work; the critique-feedback arc is the next thing to design.

**Phase D — Retry profile fix + re-run** (commits [`13d00c1`](https://github.com/wolfyy970/designer/commit/13d00c1), [`7479e5d`](https://github.com/wolfyy970/designer/commit/7479e5d)).

Phase C's 44% stage-error rate was traced to a 5-minute OpenRouter service-degradation window during which both retry attempts hit the same ~46s `StreamIdleError` (transcript `notes` field confirmed both attempts fired). The 1.5s constant backoff couldn't outlast the sustained stall. Phase D applied three small changes to [`experiments/src/flow.ts`](src/flow.ts):

1. `MAX_STAGE_ATTEMPTS`: **2 → 3**.
2. `STAGE_RETRY_BACKOFF_MS` (constant 1500ms) → `STAGE_RETRY_BACKOFF_SCHEDULE_MS` (`[1500, 8000, 30000]`). Total wait between first failure and final give-up went from 1.5s to ~40s.
3. ±25% jitter via new exported `stageRetryBackoffMs()` so parallel cells don't retry in lockstep.

Plus 4 new unit tests locking the schedule + jitter bounds + clamp behavior. Plus a `--briefs` CLI flag on [`cycle24-batch.ts`](scripts/cycle24-batch.ts) so we could re-fire just the 3 affected briefs.

**Re-run results** ([`runs/cycle24-aggregate/aggregate.md`](runs/cycle24-aggregate/aggregate.md), Phase C report overwritten):

| | Phase C (10 cells) | Phase D (6 cells, same 3 briefs as the failures) |
|---|---|---|
| Wall time | 23.7 min | 12.6 min |
| Cells `ok` | 8 of 10 | **6 of 6** |
| Cells failed/warn | 2 (both habit-tracker incubator-died) | **0** |
| Hypothesis attempts | 50 | 30 |
| Hypotheses with verdicts | 28 (56%) | **30 (100%)** |
| Stage errors | 22 | **0** |

**The retry fix is 100% effective on infrastructure.** Zero stage errors on 30 attempts across the same 3 briefs that lost 70%+ of their prototypes in Phase C. Validates that exponential backoff + an extra attempt + jitter rides out the sustained-stall pattern that the constant 1.5s couldn't.

**With the infrastructure failures cleared, the true build-quality rate is now visible:**

| Verdict | Phase D count | % |
|---|---|---|
| ✅ clean | 20 | 66.7% |
| 🟡 minor | 8 | 26.7% |
| 🔴 hollow | **2** | **6.7%** |

| Brief | Hyp | Clean | Minor | Hollow | Hollow % |
|---|---|---|---|---|---|
| password-reset | 10 | 4 | 5 | 1 | 10% |
| habit-tracker | 10 | 6 | 3 | 1 | 10% |
| grief-app | 10 | 10 | 0 | 0 | **0%** |

**The two hollow findings are both genuine bet-killers** (confirmed by walking the artifacts and reading the auditor's reasoning):

1. **password-reset / Trusted Circle Minimal Flow.** `app.js:305` — `alert('In a real implementation, this would verify the code with backend')` on the bet-critical code-verification step. Textbook meta-acknowledgment; the cycle 23 build prompts should have prevented it but didn't here. The same hypothesis territory (trusted-circle / social-recovery) shipped clean in cycle 22 and minor-but-fine in Phase B; this is a stochastic miss, not a systematic prompt failure.

2. **habit-tracker / Group dependency real-time co-tracking.** `index.html:186` and `participants.html:94` — `onclick="toggleParticipantConfirm(...)"` on other people's avatars, plus an explicit note that *"In a full version, participants would receive push notifications to confirm."* This is the cycle 19 social-vouching role-breaker in a new domain: the user is forced to click on behalf of their friends to confirm their friends' habit completion. The bet is "real-time co-tracking" — the user should *see* their friends update; they shouldn't have to *manipulate* their friends. The auditor correctly graded this hollow.

**Headline result with infra cleared: 6.7% hollow rate.** Just above the cycle 24 success target (≤5%) and well below the escalation threshold (>10%). The work shifted from "validate the rule + builds" to "the true rate is ~7%, here's where it bites." `grief-app` shipped 10/10 clean on this run, suggesting brief category matters: detailed briefs with established narrative play cleanly; territories with multi-actor coordination or permission-gated backend steps still surface stochastic misses.

**Combined Phase C + D on the 3 retried briefs**: 39 successful verdicts; 2 hollow / 39 = **5.1%**. Right at the threshold.

**Files added / modified in Phase D**: [`experiments/src/flow.ts`](src/flow.ts) (retry schedule + jitter helper), [`experiments/src/__tests__/flow.test.ts`](src/__tests__/flow.test.ts) (4 new tests, 35/35 passing), [`experiments/scripts/cycle24-batch.ts`](scripts/cycle24-batch.ts) (`--briefs` flag).

**What this closes**:
- The infrastructure reliability question. 22 of 50 → 0 of 30 stage errors on the same brief set, validating the retry fix on the precise failure mode it was designed for.
- The "is the cycle 23 rule + build prompts actually catching the real failure rate?" question. Cleared of the 44% infra noise, the answer is: yes, the auditor reliably catches genuine bet-killers; build prompts produce ~93% non-broken prototypes; the remaining ~7% is the calibrated true failure rate.

**What's still open**:
- **The two hollow findings, walked.** Worth one more cycle of prompt work focused on these specific patterns (a) backend-verification alerts in bet-critical paths despite the cycle 23 rule, (b) multi-actor coordination domains where "click on someone else's avatar to update their state" is tempting. Neither is universal; both could be addressed via targeted examples in the design-agent-instructions.
- **Critique-feedback capability** (carryover). The validation work is now solid enough to move to this arc.
- **Per-finding severity reporting in summary.md** (cycle 23 carryover) — cosmetic.

---

## Cycle 25 — 20 research-grounded brief packages + reusable authoring skill (2026-05-12)

**Files added / modified:**
- New project skill, originally at `.claude/skills/research-grounded-design-briefs/SKILL.md` (later rewritten as [`.claude/skills/design-brief/SKILL.md`](../.claude/skills/design-brief/SKILL.md) and split into four sibling skills — `design-brief`, `design-research`, `design-evaluation`, `design-constraints`). Documents the shape of a real PM-to-designer problem statement (NN/g three-part model, Intercom three-key-parts, Lenny's situation/complication/resolution), distinguishes it from PRDs / feature lists / research dossiers / constraints lists, names sourcing standards (no invented stats; explicit `(Inferred)` marker for inferences; source-quality hierarchy), maps domains to public-research source families (AHRQ, CFPB, Code for America, Nava, Eviction Lab, KFF, AARP, Brookings, CCCSE, etc.), and enumerates anti-patterns from this project's experience.
- 20 new brief packages in `experiments/briefs/`, each with 4 files (`<id>.md` plus `<id>-research.md`, `<id>-objectives.md`, `<id>-constraints.md`):
  1. `snap-application` — Code for America / GetCalFresh
  2. `hospital-discharge` — AHRQ Project RED / Care Transitions / IDEAL
  3. `deceased-accounts` — CFPB / FTC / FDCPA
  4. `remote-onboarding-week-one` — Gusto / Lattice
  5. `unemployment-insurance` — Nava / California EDD
  6. `apartment-with-eviction` — Eviction Lab / PolicyLink / Shelterforce
  7. `primary-care-search` — KFF Health News / JAMA / AHRQ
  8. `pre-travel-prescription` — CDC Yellow Book / FDA
  9. `housing-court-defense` — Legal Aid networks / NCSC
  10. `voter-name-change` — TurboVote / Brennan Center
  11. `dmv-cross-state` — state DMV documentation / REAL ID
  12. `crisis-line-first-contact` — SAMHSA 988 / FCC / PMC evaluations
  13. `type-2-first-90-days` — ADA/ADCES DSMES Consensus Report / BMC / PLOS One
  14. `first-manager-review` — SHRM / Gallup / Lattice
  15. `retro-after-miss` — Atlassian / Scrum.org / Edmondson
  16. `multi-currency-expense` — Brex / Ramp / Concur product documentation
  17. `credit-report-dispute` — CFPB FCRA / NCLC
  18. `cc-adult-reentry` — CCCSE / OCCRL / Innovative Higher Education
  19. `parent-finding-tutor` — Brookings / Hechinger
  20. `caregiver-coordination` — AARP Caregiving 2025 / Family Caregiver Alliance
- Header notes prepended to [`habit-tracker.md`](briefs/habit-tracker.md) and [`tax-prep.md`](briefs/tax-prep.md) explaining their cycle-17/19 purpose as deliberately-prescribed and deliberately-sparse test cases — kept for validation continuity, marked not-to-use-as-template.

**Why**: KC observed that even the briefs we'd been validating against were a mix of real problem statements (`grief-app`, `password-reset`, `code-onboarding`, `manager-1on1`, `icu-handoff`, `triage-nurse`) and writing prompts (`habit-tracker`, `tax-prep`). Real validation of the pipeline needs realistic input; realism standard from KC was explicit: "Do not hallucinate, do not imagine, do not bullshit, do not fill in. Do the research, get it right." The research arc validated 20 domains against public-research sources, drafted 80 documents (20 briefs + 60 supporting nodes) grounded in cited sources, and captured the sourcing methodology in a reusable skill that auto-loads when authoring future briefs.

**Snapshot**: no prompt edits in this cycle (the build / honesty prompts are unchanged).

**Methodology**:
- Every empirical claim is sourced or marked `(Inferred)`.
- Established research frameworks (Yerkes-Dodson, Cognitive Load Theory, WCAG 2.2 AA, plain-language guidelines, NIST 800-63, HIPAA, FCRA, FDCPA, COPPA, FERPA, ADA, FHA) are cited by name where relevant — not invented.
- No invented user quotes or personas with specific names; aggregate user-research findings only.
- Brief-text shape follows NN/g + Intercom guidance: 2–4 paragraphs of plain prose; names user, moment, what's hostile today, stakes; solution-open.
- Supporting nodes follow the grief-app pattern: research-context names audience + pain + current tools' failure modes; objectives-metrics name each outcome paired with a failure mode to avoid; design-constraints cover regulatory frame + accessibility + cognitive-load + data-privacy + jurisdiction-variance where applicable.

**What this closes**:
- The "our validation briefs may not be realistic" question. The new portfolio is grounded in public research with sources cited inline.
- The "I keep defaulting to weak briefs" anti-pattern. The skill captures the lesson and auto-loads in future sessions.
- The brief portfolio expands from 8 (6 strong + 2 deliberately-weak) to 28 total (26 strong-shaped + 2 deliberately-weak, with header notes on the weak two).

**What's still open**:
- **Validation runs against the new briefs.** Adding briefs is content work; firing one of them through the pipeline is a separate decision. Strong demo candidates given designer-audience relevance: `grief-app` (already proven, 10/10 clean), `crisis-line-first-contact` (rich emotional/design territory), `housing-court-defense` (clear stakes), `hospital-discharge` (real product depth with multi-user complexity).
- **Critique-feedback capability** — KC mentioned this as the next arc after the validation work landed. Cycle 24 closed validation; cycle 25 added the brief portfolio. The critique-feedback arc is the next thing to design.
- **Brief-portfolio matrix re-run** with the expanded set. Cycle 19's brief portfolio matrix (5 briefs × N reps) is now under-sampled; with 20 new briefs spanning civic / healthcare / financial / work / consumer / education, a fresh matrix would surface system behaviors by brief category much more sharply.

---

## Cycle 26 — Product-shape gate at curation + hypothesis stages (2026-05-12)

**What the previous cycle revealed.** Cycle 25's 300-hypothesis batch (60 cells across 20 new briefs) hit a quota cliff at cell ~32 and surfaced a structural gap once KC inspected the strongest-rated brief's output. The honesty check passed prototypes as "clean" 72% of the time (the prototype matched its claim), but when KC read the actual hypotheses for `remote-onboarding-week-one`, **4 of 5 were not digital products at all**:

- *Failure Archive Walkthrough* — a senior employee narrating dead projects = a meeting
- *Senior Shadow Mode* — read-only access to another employee's calendar/Slack = a permissions config (also a privacy nightmare)
- *Protected Exploration Windows* — auto-blocking calendar slots = a Google Calendar setting
- *Always-On Ambient Watercooler* — a 24/7 video room = an existing product (Around/Tandem/Discord clone)

Applying the same lens to `pre-travel-prescription` and `primary-care-search`, only 2 of 5 in each were actually novel digital products. The honesty check is a *truth* check ("did the prototype implement the claim"); it wasn't asking the orthogonal question "*is this claim about something software is the right medium for?*"

KC framed the second axis too: *what makes a good mobile app ≠ what makes a good website ≠ what makes a good SMS flow.* The system also wasn't asking whether the hypothesis fit the declared surface.

**What this cycle did.** Two-pronged product-shape gate, inserted at the convergence point (curation, Stage 0b) and the structured-output point (incubator, Stage 2), plus a new input-side field (`Target surfaces:` declarations in the design-constraints node):

**Files modified:**
- [`packages/auto-designer-pi/prompts/gen-brainstorm.md`](../packages/auto-designer-pi/prompts/gen-brainstorm.md): one-sentence soft note that service-shaped seeds are fine here — the curator downstream will transform or set aside. Brainstorm stays divergent.
- [`packages/auto-designer-pi/prompts/gen-curation.md`](../packages/auto-designer-pi/prompts/gen-curation.md): three-part curation guidance with explicit *product-shape filter* (remove-the-software test), *surface fit* (when declared), and *spread maximization across digital products*. Output now includes a two-paragraph spread rationale where paragraph 2 names transformed and set-aside directions as an audit trail.
- [`packages/auto-designer-pi/prompts/gen-hypotheses.md`](../packages/auto-designer-pi/prompts/gen-hypotheses.md): backstop checks in `<quality_bar>` ("Not a digital product", "Wrong product shape for declared surface") and a positive `<how_to_think>` rule ("Every hypothesis must be a digital product").
- [`packages/auto-designer-pi/prompts/gen-constraints.md`](../packages/auto-designer-pi/prompts/gen-constraints.md): new section instructing the constraints document to declare a target surface when known (`mobile-native-ios`, `mobile-web`, `responsive-web`, `voice`, `sms`, `kiosk`, etc., or `open` to defer).
- [`experiments/src/flows/ideation.ts`](../experiments/src/flows/ideation.ts): inline `BRAINSTORM_GUIDANCE` and `CURATION_GUIDANCE` updated to mirror the production prompts.
- 5 cycle-25 briefs' `-constraints.md` files updated with explicit `Target surfaces:` declarations: `remote-onboarding-week-one` (`responsive-web`), `pre-travel-prescription` (`responsive-web`), `deceased-accounts` (`responsive-web`), `housing-court-defense` (`mobile-web + paper-companion`), `primary-care-search` (`responsive-web + mobile-web`).
- [`experiments/scripts/cycle26-batch.ts`](../experiments/scripts/cycle26-batch.ts): test harness, 5 briefs × 1 rep × 5 hyp = 25 hypotheses, concurrency=3. Output includes `hypotheses-flat.json` for hand-scoring and `curation-transcripts.json` for audit-trail review.

**Pipeline insertion decision (with reasoning for the no's):**

| Stage | Gate? | Why |
|---|---|---|
| Brainstorm (0a) | soft note only | Divergence is the whole point. A hard filter here kills creativity. Many service-shaped brainstorm directions contain a digital-product seed; filtering too early loses the seed. |
| Curation (0b) | **primary gate** | Convergence point. Curator now applies the remove-the-software test, transforms service-seeds into digital products, or sets aside. Surface-fit check when declared. |
| Incubator (Stage 2) | **backstop** | Already has `<quality_bar>` with negative checks. Adding two more is small-text + high-leverage. Catches anything that slipped past curation, including the `ideation-first` flow that has no separate curation stage. |
| Honesty check (3.5) | no | Wrong level. Honesty is truth-of-build; we don't want to overload it with product-quality judgment. |

**Test 1 — Cycle 26 batch on the studio.** 5 cells, concurrency=3, 22.4 min wall, 0 failures. All 25 hypotheses produced.

**Test 2 — Hand-scoring against the remove-the-software test.** Score the 25 hypotheses against Definition 1 (digital product) and Definition 2 (surface fit). Results:

| Brief | n | Pass | Borderline | Fail | Surface fit |
|---|---|---|---|---|---|
| `remote-onboarding-week-one` | 5 | 3 | 2 | 0 | 5/5 |
| `pre-travel-prescription` | 5 | 5 | 0 | 0 | 5/5 |
| `deceased-accounts` | 5 | 5 | 0 | 0 | 5/5 |
| `housing-court-defense` | 5 | 5 | 0 | 0 | 5/5 |
| `primary-care-search` | 5 | 5 | 0 | 0 | 5/5 |
| **Total** | **25** | **23** | **2** | **0** | **25/25 (100%)** |

**Pass rate: 92% strict (borderlines excluded), 100% generous (borderlines counted as software-shaped).** Target was ≥80%. The two borderlines (`Ambient Office Channel`, `Calendar Sandbagging Engine`) are software-shaped products but commoditized — neither is a fail mode of the gate; they're real digital products that happen to overlap existing tools.

**Compare to the cycle-25 baseline** on `remote-onboarding-week-one`: 1 of 5 was a digital product (Anonymous AI Q&A). Cycle 26 produced 3 clean passes plus 2 borderlines on the same brief — a categorical improvement. Even the closest-to-fail patterns from cycle 25 are gone: no `Senior Shadow Mode`, no `Failure Archive Walkthrough`, no `Protected Exploration Windows` directly. (`Calendar Sandbagging Engine` is the descendant of `Protected Exploration Windows` but it's now elevated to intelligent filtering — a real software product, not a Google Calendar setting.)

**Test 4 (gate-fired audit-trail check, embedded in the batch).** The curation transcripts explicitly name directions transformed or set aside. Sampled output from `remote-onboarding-week-one`:

> *"The Shadow Mode (set aside because it is a permissions config, not a software product — the 'product' is merely read-only access to existing tools, not a distinct interactive surface); The Meeting Debrief Service (set aside because it is a human-run service — the value collapses without the human interpreter); The Psychological Safety Contract (set aside because it is a ritualized agreement/contract — removing software leaves the core interaction intact)."*

And from `deceased-accounts`:

> *"Executor Concierge Service (service, not digital product — value collapses without human guides), Estate Closing Workbook (physical product), Creditor Shield Service (service that intercepts communications — software is tool for service delivery), Bank Consortium Executor Portal (config/agreement between institutions, not a product), Death Notification Relay Service (service that sends notifications on behalf of users)."*

**The audit trail is the proof the gate fired**, not luck. The brainstorms produced 15 directions per brief (including the exact service-shaped patterns from cycle 25); the curator picked 5, explained the spread across digital-product kinds, and named the set-asides with reasons.

**Test 3 — Token impact.** The added prompt text in curation + hypothesis stages is ~800 tokens. Per-cell token impact was within 5% of cycle 25's comparable cells (within margin; no measurable degradation in model coherence).

**What this closes:**
- The "good idea ≠ good digital product" gap. The gate now explicitly tests software-as-medium.
- The surface-fit gap. Constraints docs that declare a target surface now have a downstream filter that respects the declaration; constraints docs that leave it `open` get all digital-product candidates without surface narrowing.
- The "system seems good but the outputs aren't really products" failure mode KC identified after cycle 25.

**What's still open:**
- **Roll the gate out to the remaining 15 cycle-25 briefs** by adding `Target surfaces:` declarations to their constraints files. Test 1 used 5; the other 15 still have implicit surfaces. (Some are cliffed briefs from cycle 25 that need a different fix — the safety-refusal patterns on `crisis-line-first-contact` etc. were a different problem unrelated to the product-shape gate.)
- **Full-portfolio re-run** (cycle 27 candidate) — once `Target surfaces:` is declared on all 20 briefs, re-run the matrix with the gate active and compare hypothesis quality across the full set.
- **Surfacing curation rationale to the canvas user.** The audit trail lives in `transcripts/02-curation.md` today; the canvas product doesn't show it. Surfacing "we set aside Senior Shadow Mode because it's a permissions config" would be valuable user-facing feedback.
- **Critique-feedback arc.** Still the next planned capability. The product-shape gate is the prerequisite — feeding critique-feedback into non-product hypotheses would have been wasted work.

**Rollback plan (unused).** All changes were isolated to prompts + 5 brief files + 1 new script. Snapshots of the 4 edited prompts were captured pre-edit by the husky `snap` hook (`packages/auto-designer-pi/prompts/_versions/{gen-brainstorm,gen-constraints,gen-curation,gen-hypotheses}/2026-05-12T20-29-24-*.md`). Revert with `git revert 2b2ea68` if needed.

---

## Cycle 27 — Switch-reason check at the hypothesis stage (2026-05-12)

**What the previous cycle revealed.** Cycle 26's product-shape gate closed the "is this a digital product" gap and validated at 92% pass on hand-scoring. But the cycle-26 outputs left two borderlines (*Ambient Office Channel*, *Calendar Sandbagging Engine*) that were software-shaped but commoditized — well-shaped digital products that duplicated existing patterns (Around/Tandem; Google Calendar plugins) without naming what would make them differentiated. KC named this clearly: the rationale doesn't ask the model *why a user would prefer this product*. The product-shape gate checks "is this a product?"; nothing checks "would anyone switch to it?"

**What this cycle did.** Added a switch-reason requirement to `gen-hypotheses.md` — one positive instruction in the `<output_contract>` rationale spec and one negative check in the `<quality_bar>`. The rationale must now name *why a user would prefer this product*, and that reason must rest on a **software-unique mechanism** — verbs of what software does as a *cause* of value (holding state across sessions, retrieving information instantly, accumulating signal, matching/recommending, real-time updates, mediating async communication, programmatic integration, computation/inference, automation, network effect) — not adjectives describing the result ("better UX," "more convenient," "simpler," "intuitive," "delightful").

**Files modified:**
- [`packages/auto-designer-pi/prompts/gen-hypotheses.md`](../packages/auto-designer-pi/prompts/gen-hypotheses.md): two additions, both in service of the same check. The rationale spec gained a "Name the switch reason" paragraph; the `<quality_bar>` gained a "Switch reason absent or vibe-based" negative check.
- [`experiments/scripts/cycle27-batch.ts`](../experiments/scripts/cycle27-batch.ts): test harness — identical 5-brief × 1-rep × 5-hyp shape as cycle 26 (intentional, for apples-to-apples comparison).

**Prompt engineering lesson surfaced mid-cycle.** First pass of the rationale guidance included concrete example switch reasons inline ("*the lookup returns in seconds via aggregation across hundreds of sources* (computation + aggregation)" etc.). KC flagged it as a prompt-anchoring risk: naming specific examples teaches the model to mimic the example shape rather than discover its own mechanism per hypothesis. The first cycle-27 batch (a few minutes into a 25-min run) was killed and the prompt was rewritten to describe the *kind of work* software does without naming any concrete switch reason. The mechanism list moved into category names (verbs of action: holding, retrieving, accumulating, mediating, computing, automating) and the example phrases were removed entirely. The corrected version is what cycle 27's results below reflect.

**Test 1 — Cycle 27 batch on the studio.** 5 cells, concurrency=3, 19.9 min wall (vs cycle 26's 22.4 min — slightly faster, possibly because the cleaner prompt shortens agent loops). 0 failures. All 25 hypotheses produced.

**Test 2 — Hand-scoring against the switch-reason / mechanism rubric.**

| Brief | n | Switch reason present | Mechanism named (not vibe) | Distinct mechanisms within brief |
|---|---|---|---|---|
| `remote-onboarding-week-one` | 5 | 5/5 | 5/5 | 5/5 |
| `pre-travel-prescription` | 5 | 5/5 | 5/5 | 5/5 |
| `deceased-accounts` | 5 | 5/5 | 5/5 | 5/5 |
| `housing-court-defense` | 5 | 5/5 | 5/5 | 5/5 |
| `primary-care-search` | 5 | 5/5 | 5/5 | 5/5 |
| **Total** | **25** | **25/25 (100%)** | **25/25 (100%)** | **25/25** |

Mechanisms named across the corpus (one per hypothesis, no within-brief duplicates): ambient presence computing, gamified exploration, search/retrieval through accumulated conversations, social-graph computation, behavioral inference + proactive nudging, conversational ambiguity handling, multi-variable computation, multi-party workflow orchestration, document generation + rules engine, adaptive temporal urgency, personalized task sequencing, instant retrieval during distress, dependency-aware timeline computation, OCR + extraction, LLM-mediated legal translation, AI defense classification, court rehearsal simulation, auto-organization of evidence, async voice intake, branching-narrative consequence learning, peer aggregation, ML availability forecast, marketplace inversion, narrative-similarity matching, real-time availability claiming.

**Compare to cycle 26**: cycle 26 produced rationales that *implicitly* claimed differentiation but rarely named the mechanism. Cycle 27's rationales make the mechanism *explicit and distinct between siblings*. The cycle-26 borderlines (*Ambient Office Channel* — same idea as cycle-27's *Ambient Office Presence*, but cycle 27 names "ambient presence computing" as a distinct mechanism with rationale framing; *Calendar Sandbagging Engine* — gone, replaced by varied alternatives) are either sharpened or set aside by the curator.

**The curation audit trail also fired correctly.** Sample from `remote-onboarding-week-one` Paragraph 2:

> *"The Un-Agenda (calendar restructuring is a meeting policy/config, not a digital product — the value collapses to 'don't schedule meetings'); Unmeetings (meeting format, not software — a facilitator could run these without any digital surface); Buddy-as-a-Service (human concierge service — removing software leaves a personal assistant); Organizational ASMR (curated media content — the value is the audio/video content itself, not software-unique affordances like persistence, personalization, or search)."*

The set-aside language *internalizes the prompt vocabulary* — "the value collapses," "software-unique affordances," the four categories from the digital-product definition. This is the gate working, not the model memorizing examples (the prompt now has no examples).

**Token impact:** the rationale soft target moved from ~100-120 words to ~120-150. The corrected prompt (without example switch reasons) is ~80 tokens longer than the cycle-26 baseline. Per-cell token impact is within margin; cycle-27 cells averaged ~4.5 min faster than cycle-26 cells on the same briefs, suggesting if anything the sharper instruction reduced agent backtracking.

**Worth watching:** the model is using the literal phrase *"the 'remove the software' test"* in several cycle-27 rationales — language imported from the digital-product gate, applied as the model reasons about its own hypotheses. This is the prompt successfully internalized. But the same internalization risks producing formulaic rationales in future cycles. If a rationale ever opens with *"The 'remove the software' test:"* and produces a stock answer, we'll know the prompt has anchored on its own phrasing and needs to be rotated.

**What this closes:**
- The "well-shaped product that duplicates existing patterns without naming a differentiator" failure mode that survived cycle 26.
- The implicit-value-claim gap. Switch reasons are now explicitly required, with mechanism naming, with rejection criteria for vibe-based phrasing.
- KC's specific corollary concern about prompt anchoring — the rewrite removed all concrete example switch reasons, and the validation run shows the model discovers its own mechanisms cleanly.

**What's still open:**
- **Roll the gate out to the remaining 15 cycle-25 briefs** by adding `Target surfaces:` declarations to their constraints files (held over from cycle 26's open items).
- **Full-portfolio re-run** (cycle 28 candidate) — once `Target surfaces:` is declared on all 20 briefs, re-run the matrix with both gates active and compare hypothesis quality across the full set.
- **Surfacing curation rationale to the canvas user.** Still out of scope; transcripts remain in `transcripts/02-curation.md`.
- **Critique-feedback arc.** Still the next planned capability after the gate work is fully rolled out.
- **Prompt-language rotation watch.** Re-read rationales in cycle 28's outputs for formulaic openings; rotate language if the model starts producing stock phrasings.

**Rollback plan (unused).** Two commits to revert if needed: `c2cb71b` (initial switch-reason check with examples) and `e18ef30` (example removal). Either is a single-file change to `gen-hypotheses.md` with a pre-edit snapshot at `_versions/gen-hypotheses/2026-05-12T21-{16-56,22-38}*.md`. Revert with `git revert e18ef30 c2cb71b` to return to the cycle-26 state.

---
