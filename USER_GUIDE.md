# User Guide

## Setup

```bash
pnpm install
cp .env.example .env.local
# Optional but recommended for agentic mode: headless Chromium for browser-grounded eval
pnpm exec playwright install chromium
```

Add your API key to `.env.local`:

```
OPENROUTER_API_KEY=sk-or-...
```

This key stays server-side only (the Hono API reads it; Vite proxies `/api` in dev).

For LM Studio vision models, optionally set:

```
VITE_LMSTUDIO_VISION_MODELS=llava,minicpm-v,qwen2-vl
```

```bash
pnpm dev:all      # recommended: API then Vite (avoids early proxy errors)
# Or: pnpm dev:server  in one terminal, pnpm dev  in another
```

Both processes are needed for local development.

**Only Vite running:** The UI blocks on `**GET /api/config`** until the API (default **`PORT`** **4731**) answers—use `**pnpm dev:all`** or run `**pnpm dev:server`** alongside `**pnpm dev`**. The dev design-token page `**/dev/design-tokens**` is the only route that skips that check.

**Saved canvases and browser storage:** The app keeps your active workspace in browser storage for the origin you use (default dev: `**http://localhost:4732**`; not `127.0.0.1` — that is a separate origin to the browser). Canvas Manager stores the lightweight list in **localStorage** and full canvas snapshots/artifacts in **IndexedDB**. The URL includes the **port**: opening the app on a different port is a different site, so lists and the current canvas can look empty. Vite uses **`strictPort`** for the dev URL; if Vite won’t start, run `pnpm dev:kill` and retry. Override with **`VITE_PORT`** in `.env.local` (see `.env.example`).

## Dev logs

In **development** only, the API keeps an in-memory `**/api/logs`** ring (LLM rows + run-trace lines) and can append optional NDJSON—handy for **curl** or ad-hoc inspection; see [ARCHITECTURE.md](ARCHITECTURE.md). That route returns **404** in **production**. The **variant run timeline** still shows live tool activity for the current preview.

## Design tokens reference (Settings)

**Development only:** **Settings** (gear) → **General** → **Open design tokens kitchen sink** opens a scrollable modal of live `@theme` colors, typography, and composition classes (`ds-*`, `.input-focus`). The same content is available at `**/dev/design-tokens`**. Semantics and rules: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Prompts and skills (editing the repo)

All LLM-facing prompt **bodies** ship inside the [`@auto-designer/pi`](packages/auto-designer-pi/) workspace package — three real skills under `packages/auto-designer-pi/skills/<key>/SKILL.md` (YAML frontmatter + markdown body) and per-task prompt templates under `packages/auto-designer-pi/prompts/<name>.md` (including the designer system prompt `_designer-system.md`). The server loads them per request via `server/lib/prompt-resolution.ts`; prompt keys (`PromptKey`, `PROMPT_KEYS`) live in `src/lib/prompts/defaults.ts`. There is no in-app prompt editor—change files, restart the API if needed, and run tests. See [ARCHITECTURE.md](ARCHITECTURE.md) and [PRODUCT.md](PRODUCT.md).

### Version history

If you edit a **skill** (`packages/auto-designer-pi/skills/<key>/SKILL.md`), a **prompt template** (`packages/auto-designer-pi/prompts/<name>.md`, including `_designer-system.md` and `artifact-conventions.md`), or **`src/lib/rubric-weights.json`** yourself (this app's prompts live in the repo — there is no in-app editor), you can keep a history without snapshotting *before* every edit.

**What gets saved**

- **Skills:** Timestamped copies under **`packages/auto-designer-pi/skills/<key>/_versions/`** next to each `SKILL.md`.
- **Prompt templates:** **`packages/auto-designer-pi/prompts/_versions/<name>/`** — single shared `_versions/` dir under prompts, with one subdir per template file. Pi's loader does NOT recurse, so `_versions/` is invisible to slash-command discovery.
- **Rubric weights:** Still under **`.prompt-versions/snapshots/`** (so `src/lib/` stays clean).
- **Manifest:** **`.prompt-versions/manifest.jsonl`** records every snapshot (manual + meta-harness).

**What to do**

1. **Edit** — Change files in your editor and save as usual. Iterate as much as you want.
2. **Checkpoint** — From the repo root, run **`pnpm snap`** (no arguments). It compares each versioned file to its **latest snapshot** and saves **only** what changed. Run it whenever you want a named point in time, or rely on **git commit** (the pre-commit hook runs the same logic and stages new snapshots).
3. **Commit** — Commit your edits **and** new files under **`_versions/`**, **`.prompt-versions/`**, and the manifest so the team shares history.

That is the normal loop: edit first, snap after.

**Power user: one explicit file**

```bash
pnpm snap packages/auto-designer-pi/skills/<key>/SKILL.md
```

That still snapshots the **current on-disk** contents of that path (legacy “save this version now”).

**Later: list, diff, or restore**

| Goal | Command |
|------|---------|
| List saved versions (newest first) | `pnpm snap --list <path>` |
| Diff two saved versions | `pnpm snap --diff <path> <safeTsA> <safeTsB>` |
| Diff latest snapshot vs working file | `pnpm snap --diff-current <path>` |
| Restore a saved version (backs up current file first) | `pnpm snap --restore <path> <safeTs>` |

The **`safeTs`** id is the first column from `--list`.

**Note — meta-harness:** The separate **`pnpm meta-harness`** app snapshots those paths **automatically** when its proposer or promotion **`P`** writes files. You **do not** run **`pnpm snap`** for that flow. See **[meta-harness/VERSIONING.md](meta-harness/VERSIONING.md)**.

## Evaluator defaults (Settings → Evaluator defaults)

**Settings** (gear) → **Evaluator defaults** sets **global defaults** for **maximum revision rounds**, optional **target quality score**, and **rubric weights**—used only when **Auto-improve** is **on** (that path runs evaluators and may loop). **Auto-improve** **off** = one **agentic** build with **no** evaluator (faster). Each Hypothesis node can override max rounds and target score when Auto-improve is on. When the target score is set, a revising run can stop early when the **weighted overall score** meets the threshold with **no hard fails**—otherwise stopping follows the revision gate and the round cap. Env defaults (`AGENTIC_MAX_REVISION_ROUNDS`, `AGENTIC_MIN_OVERALL_SCORE`) are served in `**GET /api/config`** and seed the UI once before you customize; see [ARCHITECTURE.md](ARCHITECTURE.md).

## Canvas Workflow

The canvas (`/canvas`) is the default interface. Nodes connect left-to-right. You need a **viewport at least 1024px wide**; narrower screens show a desktop-only message instead of the canvas (see [README.md](README.md)). The **build stamp** in the header (version · Eastern time) and Husky **patch** bumps are documented in [AGENTS.md](AGENTS.md) — including restarting Vite to refresh the stamp after commits.

### 1. Fill in Input Nodes

The canvas starts with a **Design Brief**, a **Design System**, a **Model**, and an **Incubator**. Source nodes connect into the Incubator; the Model is connected to the Incubator, not to each input. Optional input facets appear as ghost cards; use the circular **Add to canvas** control on a ghost to materialize that input node.

- **Design Brief** — The primary directive. What are you designing and why?
- **Research Context** — User research, behavioral insights, qualitative findings.
- **Objectives & Metrics** — Success criteria, KPIs, evaluation measures.
- **Design Constraints** — Non-negotiable boundaries + exploration ranges.
- **Design System** — Tokens, components, patterns, brand notes, screenshots, and Markdown source files.

Write in prose, not bullets. Precision is the product.

**Optional inputs:** The default template focuses on Design Brief + Design System + Model + Incubator. Other sections may show as **ghost** prompts on the canvas until you add them from the ghost card (or load a saved canvas whose spec already fills that section—see **Managing Canvases**). Ghost cards are persistent affordances and reappear if you remove the optional input node; when you activate one, the viewport tracks the newly created node after it moves into the input group.

**Auto-generate (Research / Objectives / Constraints):** On those three input nodes, an **auto-generate** action (when shown) drafts or refines the spec facet body from your **Design Brief** and any other spec sections you have already filled in. It uses the **first Model node** on the canvas (document order—the same fallback as auto-connect). **Lockdown** still pins provider/model server-side. The server resolves copy from the `**inputs-gen-research-context`**, `**inputs-gen-objectives-metrics`**, and `**inputs-gen-design-constraints**` skill packages under `**skills/**` (see [ARCHITECTURE.md](ARCHITECTURE.md)).

### 2. Connect a Model Node

Use the **Model** node connected to the Incubator. Select your provider and model in the Model node — **unless lockdown is enabled** in `config/feature-flags.json`: then every run uses **OpenRouter + MiniMax M2.5**, pickers are disabled, and the canvas reconciles to that pin. With lockdown off, you can use different Model nodes for **incubation** vs **generation** (e.g. a reasoning model on the Incubator and a faster one on hypotheses).

### 3. Incubate

Connect input nodes to the **Incubator** (edges auto-connect on add). With a **Model** connected and at least a minimal **Design Brief** written, click **Generate** and choose how many new hypotheses to create. The Incubator sends your connected inputs to the LLM and produces that many hypothesis strategy cards. **blank hypothesis** does the same readiness check (brief + model) but adds a single empty strategy card without calling the LLM, for hand-editing.

The Incubator shows generated-document readiness before it runs. **Design specification** moves from **missing** to **ready to generate** once the Design Brief has content, then to **needs update** if connected input content changes after a document exists. **DESIGN.md** follows the active Design System style: Wireframe is already ready, Custom only participates when custom source material exists, and None is ignored.

### 4. Edit Hypotheses

Hypothesis nodes appear to the right of the Incubator. Each represents a hypothesis strategy with:

- **Name** — Editable label (double-click or pencil icon)
- **Hypothesis** — The core design bet
- **Details** (expandable) — Rationale, measurements

Edit these before generation. Remove strategies not worth exploring.

### 5. Design System

The **Design System** node is a required source input. It starts in **Wireframe** mode, using Designer's built-in low-fidelity `DESIGN.md` source so early runs stay draft-like. It behaves like the other source inputs: connect it to the Incubator and/or hypotheses when you want that source included. It does not connect directly to Model nodes; model choice is implicit through the Incubator or Hypothesis doing the generation.

- Switch to **Custom** to type or paste DESIGN.md, tokens, style-guide prose, or brand notes
- Drag-and-drop screenshots, reference images, or DESIGN.md files when custom source material matters
- Switch to **None** to keep the node on the canvas but exclude design-system guidance
- The Incubator prepares the linted Google DESIGN.md document from connected Design System sources before incubation; the Design System node itself stays focused on source material

### 6. Generate Designs

Each hypothesis has built-in generation controls at the bottom. Connect a Model node, set **thinking** on the Model (None / Light / Deep) when supported, then click **Design**. Every run uses the **agentic** engine: the agent plans files, writes/edits/validates them, and streams progress to the preview.

**Auto-improve** (on the hypothesis card): when **off** (default for fast runs), the run stops after that **single** agent build—**no** evaluator, no scorecard. When **on**, the server runs **evaluation** (LLM rubrics plus browser QA) and can apply **revision passes** from that feedback, up to the max rounds and optional target score (overridable per node; **Settings → Evaluator defaults** sets the baseline) — see **[PRODUCT.md](PRODUCT.md)** for the full pipeline.

Runs often take several minutes (shorter when Auto-improve is off). **Server at capacity:** the API enforces a cap of `MAX_CONCURRENT_AGENTIC_RUNS` (default 5) parallel agentic runs; when every slot is busy, **Design** turns into a greyed **“Server busy (N/M)”** hint — wait for a run to finish instead of retrying. When Auto-improve was on, the preview includes an **evaluation summary** and, if Playwright is installed, a small **browser capture** under Runtime QA. Generated HTML may use **Google Fonts** only via `fonts.googleapis.com` / `fonts.gstatic.com` (needs network in your browser for preview); other CDNs stay disallowed — see [ARCHITECTURE.md](ARCHITECTURE.md).

**Output format hint:** If your **incubation plan** strategy dimensions include a value for **format** (or `output_format`), it is sent as evaluation context so the server can pick matching **skills** for the agent. Details live in PRODUCT / ARCHITECTURE — you do not need to set this unless you use those dimensions.

Running generation again adds new versions — use the version navigation arrows on the preview card to browse previous results.

**While a run is in flight:** Use **Stop** on the **hypothesis** card to abort the in-flight request for that strategy lane (same as ending the SSE stream).

**Progress and workspace:** Starting **Design** does **not** auto-open the run workspace—the preview card shows progress first. Use **Watch agent** or the **panel** icon on the preview toolbar to open the **run workspace** (an overlay on the right); you can still **pan and zoom** the canvas while it is open. The preview card footer summarizes live status with a **three-state chip** that shows what the model is doing right now: 🧠 Brain for extended reasoning, 💬 for narrating (visible text between tool calls), and 🔧 Wrench for an active tool call; the token count keeps ticking through every phase. When a thinking turn ends, a transient **`🧠 Xs`** badge briefly shows how long it reasoned. **Skills in use** and the full **Monitor** timeline—including tool traces—live in the workspace. The timeline’s **Tool use** block shows the active tool in the header when collapsed; when expanded, each streaming tool row uses the same pulse + `Nk tok` pattern as the chip.

**Removing nodes from the canvas:** Use **Backspace** or **Delete** with one or more nodes selected. A short confirmation appears for nodes that can be removed (input cards and structural nodes like the incubator stay protected). Removing a hypothesis also drops its preview nodes. **Selected connections** (edges) delete with the same keys and no extra dialog. The shared spec document is separate; text in section cards may still exist there until you edit it elsewhere.

### 7. Review Designs

Preview nodes render the generated code in sandboxed iframes. Open the **run workspace** (panel icon or **Watch agent** while generating) for the full timeline, tasks, **Design**/**Evaluation** tabs (when evaluation ran), and—when a run had several evaluator rounds—a shared **Eval round** control on Design and Evaluation to preview that round’s files and scores.

**Best pick:** If you disagree with the evaluator’s ranking, use **Mark as best** (star on the preview toolbar or “Mark as best” in full-screen). **Clear best pick** restores score-based default for that strategy lane. Full-screen **prev/next design** moves between preview nodes **for the same hypothesis** when domain slots are present.

**Single-file results:**

- **Zoom** — +/- buttons or auto-fit
- **Source** — Toggle Preview/Source to see the raw HTML
- **Full-screen** — Click the expand icon for full-viewport preview

**Multi-file (agentic) results:**

- **Preview tab** — Serves the virtual tree from `**/api/preview/sessions`** in the iframe (relative links work). If registration fails, falls back to a bundled `**srcDoc`**. See [PRODUCT.md](PRODUCT.md).
- **Code tab** — File explorer on the left, raw file content on the right
- **Download** — Zip button downloads all files as a `.zip` archive
- **Eval strip** — Aggregate score, suggested fixes, and runtime QA (including optional headless screenshot)
- **Full-screen** — Same as single-file

**Version badges** — v1, v2, etc. with ChevronLeft/Right to browse accumulated versions across runs.

### 8. Iterate

To iterate on results:

- **Reference code** — Connect a preview to an Incubator to pass the prior design into the next **incubate** run as a **reference design** in the prompt.
- **Re-incubate** — The Incubator reads **reference designs** (and input-node facets from the spec) from its connected nodes, producing improved hypotheses. In **agentic** mode, evaluator feedback and revision passes are built into the generation run (see the preview run workspace scorecard).

### Auto-Layout

Open **Settings** (gear) → **General** and toggle **Auto layout**. When on:

- All nodes are positioned automatically based on their connections
- Nodes are not draggable (prevents accidental misalignment)
- Layout updates after incubation, generation, adding/removing nodes, or new connections

When off, drag nodes freely.

## Managing Canvases

Click **Canvas Manager** in the header:

- **Save Current** — Snapshot the active canvas to the browser library
- **New Canvas** — Saves the current canvas, creates a blank canvas
- **Duplicate** — Creates a copy for iteration
- **Export Canvas** — Downloads a self-contained canvas `.json` bundle where practical
- **Import Canvas** — Loads a previously exported canvas bundle; legacy spec-only JSON still imports
- **Load** — Saves the current canvas, then switches to a saved canvas
- **Reload saved** — Explicitly discards unsaved active changes and reloads the saved copy
- **Delete** — Remove a saved canvas from the browser library

Saved canvases include the graph, viewport, inputs, model/settings nodes, domain wiring, incubator state, generated preview metadata, version selections, best-pick overrides, and generated artifacts. Purely transient UI state such as open modals, hover/focus, and live stream internals is not saved. Replacing actions stop active runs before checkpointing so late stream callbacks cannot mutate the newly loaded canvas.
