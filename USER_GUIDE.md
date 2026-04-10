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

**Only Vite running:** The UI blocks on **`GET /api/config`** until the API on port **3001** answers—use **`pnpm dev:all`** or run **`pnpm dev:server`** alongside **`pnpm dev`**. The dev design-token page **`/dev/design-tokens`** is the only route that skips that check.

**Saved canvases and browser storage:** The app keeps your **active spec** and **Canvas manager** library in **localStorage** for **`http://localhost:5173`** (not `127.0.0.1` — that is a separate origin to the browser). The URL includes the **port**: opening the app on a different port is a different site, so lists and the current canvas can look empty. The dev server **requires port 5173**; if Vite won’t start, run `pnpm dev:kill` and retry.

## Dev logs

In **development** only, the API keeps an in-memory **`/api/logs`** ring (LLM rows + run-trace lines) and can append optional NDJSON—handy for **curl** or ad-hoc inspection; see [ARCHITECTURE.md](ARCHITECTURE.md). That route returns **404** in **production**. The **variant run timeline** still shows live tool activity for the current preview.

## Design tokens reference (Settings)

**Development only:** **Settings** (gear) → **General** → **Open design tokens kitchen sink** opens a scrollable modal of live `@theme` colors, typography, and composition classes (`ds-*`, `.input-focus`). The same content is available at **`/dev/design-tokens`**. Semantics and rules: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Prompts and skills (editing the repo)

All LLM-facing prompt **bodies** ship with the repo: **`skills/<key>/SKILL.md`** (YAML frontmatter + markdown body) and the designer **system** text in **`prompts/designer-agentic-system/PROMPT.md`**. The server loads and composes them per request via **`server/lib/prompt-resolution.ts`**. Prompt **keys** (`PromptKey`, `PROMPT_KEYS`) live in **`src/lib/prompts/defaults.ts`**. There is no in-app prompt editor—change files, restart the API if needed, and run tests. See [ARCHITECTURE.md](ARCHITECTURE.md) and [PRODUCT.md](PRODUCT.md).

## Evaluator defaults (Settings → Evaluator defaults)

**Settings** (gear) → **Evaluator defaults** sets **global defaults** for **maximum revision rounds**, optional **target quality score**, and **rubric weights**—used only when **Auto-improve** is **on** (that path runs evaluators and may loop). **Auto-improve** **off** = one **agentic** build with **no** evaluator (faster). Each Hypothesis node can override max rounds and target score when Auto-improve is on. When the target score is set, a revising run can stop early when the **weighted overall score** meets the threshold with **no hard fails**—otherwise stopping follows the revision gate and the round cap. Env defaults (`AGENTIC_MAX_REVISION_ROUNDS`, `AGENTIC_MIN_OVERALL_SCORE`) are served in **`GET /api/config`** and seed the UI once before you customize; see [ARCHITECTURE.md](ARCHITECTURE.md).

## Canvas Workflow

The canvas (`/canvas`) is the default interface. Nodes connect left-to-right. You need a **viewport at least 1024px wide**; narrower screens show a desktop-only message instead of the canvas (see [README.md](README.md)). The **build stamp** in the header (version · Eastern time) and Husky **patch** bumps are documented in [AGENTS.md](AGENTS.md) — including restarting Vite to refresh the stamp after commits.

### 1. Fill in Input Nodes

The canvas starts with a **Design Brief**, a **Model**, and an **Incubator** — all pre-connected. Add more input nodes from the toolbar:

- **Design Brief** — The primary directive. What are you designing and why?
- **Existing Design** — Describe what exists today. Drag-and-drop screenshots as reference images.
- **Research Context** — User research, behavioral insights, qualitative findings.
- **Objectives & Metrics** — Success criteria, KPIs, evaluation measures.
- **Design Constraints** — Non-negotiable boundaries + exploration ranges.

Write in prose, not bullets. Precision is the product.

**Optional inputs:** The default template focuses on Design Brief + Model + Incubator. Other sections may show as **ghost** prompts on the canvas until you add the node from the toolbar (or load a saved canvas whose spec already fills that section—see **Managing Canvases**).

**Auto-generate (Research / Objectives / Constraints):** On those three input nodes, an **auto-generate** action (when shown) drafts or refines the spec facet body from your **Design Brief** and any other spec sections you have already filled in. It uses the **first Model node** on the canvas (document order—the same fallback as auto-connect). **Lockdown** still pins provider/model server-side. The server resolves copy from the **`inputs-gen-research-context`**, **`inputs-gen-objectives-metrics`**, and **`inputs-gen-design-constraints`** skill packages under **`skills/`** (see [ARCHITECTURE.md](ARCHITECTURE.md)).

### 2. Connect a Model Node

Add a **Model** node (Processing group) and connect it to the Incubator. Select your provider and model in the Model node — **unless the deployment is in lockdown mode** (server env `LOCKDOWN` unset or empty): then every run uses **OpenRouter + MiniMax M2.5**, pickers are disabled, and the canvas reconciles to that pin. Set `LOCKDOWN=false` on the API to restore normal selection. With lockdown off, you can use different Model nodes for **incubation** vs **generation** (e.g. a reasoning model on the Incubator and a faster one on hypotheses).

### 3. Incubate

Connect input nodes to the **Incubator** (edges auto-connect on add). With a Model node connected, click **Generate**. The Incubator sends your connected inputs to the LLM and produces hypothesis strategies.

### 4. Edit Hypotheses

The **New hypothesis** placeholder (dashed card) offers **Blank** (empty card) or **Generate** (runs the same incubation LLM with **count = 1** to fill the new card from your **Design Brief** and sibling strategies — requires a connected **Model** and a non-empty brief).

Hypothesis nodes appear to the right of the Incubator. Each represents a hypothesis strategy with:
- **Name** — Editable label (double-click or pencil icon)
- **Hypothesis** — The core design bet
- **Details** (expandable) — Rationale, measurements

Edit these before generation. Remove strategies not worth exploring.

### 5. Add Design System (Optional)

Add a **Design System** node from the toolbar (Processing group). It auto-connects to all existing hypotheses. You can have multiple design system nodes — e.g., one for Material Design tokens, another for a custom system.

- Type or paste design tokens directly into the content area
- Drag-and-drop screenshots of existing design systems, then click **Extract from Images** to have an LLM read the tokens from the images

### 6. Generate Designs

Each hypothesis has built-in generation controls at the bottom. Connect a Model node, set **thinking** on the Model (None / Light / Deep) when supported, then click **Design**. Every run uses the **agentic** engine: the agent plans files, writes/edits/validates them, and streams progress to the preview.

**Auto-improve** (on the hypothesis card): when **off** (default for fast runs), the run stops after that **single** agent build—**no** evaluator, no scorecard. When **on**, the server runs **evaluation** (LLM rubrics plus browser QA) and can apply **revision passes** from that feedback, up to the max rounds and optional target score (overridable per node; **Settings → Evaluator defaults** sets the baseline) — see **[PRODUCT.md](PRODUCT.md)** for the full pipeline.

Runs often take several minutes (shorter when Auto-improve is off). When Auto-improve was on, the preview includes an **evaluation summary** and, if Playwright is installed, a small **browser capture** under Runtime QA. Generated HTML may use **Google Fonts** only via `fonts.googleapis.com` / `fonts.gstatic.com` (needs network in your browser for preview); other CDNs stay disallowed — see [ARCHITECTURE.md](ARCHITECTURE.md).

**Output format hint:** If your **incubation plan** strategy dimensions include a value for **format** (or `output_format`), it is sent as evaluation context so the server can pick matching **skills** for the agent. Details live in PRODUCT / ARCHITECTURE — you do not need to set this unless you use those dimensions.

Running generation again adds new versions — use the version navigation arrows on the preview card to browse previous results.

**While a run is in flight:** Use **Stop** on the hypothesis or in the preview run workspace to abort the in-flight request for that strategy lane (same as ending the SSE stream).

**Removing nodes from the canvas:** Use **Backspace** or **Delete** with one or more nodes selected. A short confirmation appears for nodes that can be removed (input cards and structural nodes like the incubator stay protected). Removing a hypothesis also drops its preview nodes. **Selected connections** (edges) delete with the same keys and no extra dialog. The shared spec document is separate; text in section cards may still exist there until you edit it elsewhere.

### 7. Review Designs

Preview nodes render the generated code in sandboxed iframes. Open the **run workspace** (panel icon on the toolbar) for the full timeline, tasks, **Design**/**Evaluation** tabs (when evaluation ran), and—when a run had several evaluator rounds—a shared **Eval round** control on Design and Evaluation to preview that round’s files and scores.

**Best pick:** If you disagree with the evaluator’s ranking, use **Mark as best** (star on the preview toolbar or “Mark as best” in full-screen). **Clear best pick** restores score-based default for that strategy lane. Full-screen **prev/next design** moves between preview nodes **for the same hypothesis** when domain slots are present.

**Single-file results:**
- **Zoom** — +/- buttons or auto-fit
- **Source** — Toggle Preview/Source to see the raw HTML
- **Full-screen** — Click the expand icon for full-viewport preview

**Multi-file (agentic) results:**
- **Preview tab** — Serves the virtual tree from **`/api/preview/sessions`** in the iframe (relative links work). If registration fails, falls back to a bundled **`srcDoc`**. See [PRODUCT.md](PRODUCT.md).
- **Code tab** — File explorer on the left, raw file content on the right
- **Download** — Zip button downloads all files as a `.zip` archive
- **Eval strip** — Aggregate score, suggested fixes, and runtime QA (including optional headless screenshot)
- **Full-screen** — Same as single-file

**Version badges** — v1, v2, etc. with ChevronLeft/Right to browse accumulated versions across runs.

### 8. Iterate

To iterate on results:
- **Screenshot feedback** — Drag a connection from a preview's right handle to the Existing Design node. This captures a screenshot and adds it as a reference image.
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

- **Save Current** — Snapshot the active canvas to localStorage
- **New Canvas** — Saves the current canvas, creates a blank canvas
- **Duplicate** — Creates a copy for iteration
- **Export JSON** — Downloads the canvas as a `.json` file
- **Import JSON** — Loads a previously exported canvas
- **Load** — Switch to a saved canvas
- **Delete** — Remove a saved canvas from localStorage
