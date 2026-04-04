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

This key stays server-side (Vite proxy). Alternatively, enter an OpenRouter key via the Settings panel (gear icon in header) — keys entered there are stored in localStorage.

For LM Studio vision models, optionally set:
```
VITE_LMSTUDIO_VISION_MODELS=llava,minicpm-v,qwen2-vl
```

```bash
pnpm dev:all      # recommended: API then Vite (avoids early proxy errors)
# Or: pnpm dev:server  in one terminal, pnpm dev  in another
```

Both processes are needed for local development.

**Saved canvases and browser storage:** The app keeps your **active spec** and **Canvas manager** library in **localStorage** for **`http://localhost:5173`** (not `127.0.0.1` — that is a separate origin to the browser). The URL includes the **port**: opening the app on a different port is a different site, so lists and the current canvas can look empty. The dev server **requires port 5173**; if Vite won’t start, run `pnpm dev:kill` and retry.

## Observability (development)

Open **Observability** from the canvas header. The **LLM** and **Run trace** tabs poll **`GET /api/logs`**: in-memory rings on the API server (plus optional local NDJSON in dev; see [ARCHITECTURE.md](ARCHITECTURE.md)). They are a **session/dev audit view**, not a full copy of nested traces.

The **Langfuse** tab does not load traces into the app; it links to the **Langfuse UI** for full traces, generations, and spans. That requires `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL`, and **`VITE_LANGFUSE_BASE_URL`** set to the same host so the button opens the correct region.

**Privacy:** With Langfuse Cloud (or any hosted Langfuse) tracing enabled, **prompt and completion text** can be exported to that project along with spans. Treat Langfuse org, project, and API keys like production secrets.

**Clear** empties the in-memory rings only; it does not delete Langfuse data.

## System prompts (Settings → Prompts)

**Settings** (gear) → **Prompts** opens **Prompt Studio** for versioned system prompts. Changes are **not** auto-saved — click **Save** or use ⌘S / Ctrl+S. A confirmation shows the stored **version**.

Templates are stored in **Langfuse**; the technical names (`compilerSystem`, `variant`, …) are listed with plain-English explanations in [LANGFUSE_PROMPTS.md](LANGFUSE_PROMPTS.md). **`pnpm db:seed`** creates **missing** Langfuse prompts only (Prompt Studio stays canonical after that). To reset all prompts from the repo, run **`pnpm langfuse:sync-prompts`**. Agent **skills** are not part of seed — they load from the database via Prisma.

## Canvas Workflow

The canvas (`/canvas`) is the default interface. Nodes connect left-to-right.

### 1. Fill in Input Nodes

The canvas starts with a **Design Brief**, a **Model**, and an **Incubator** — all pre-connected. Add more input nodes from the toolbar:

- **Design Brief** — The primary directive. What are you designing and why?
- **Existing Design** — Describe what exists today. Drag-and-drop screenshots as reference images.
- **Research Context** — User research, behavioral insights, qualitative findings.
- **Objectives & Metrics** — Success criteria, KPIs, evaluation measures.
- **Design Constraints** — Non-negotiable boundaries + exploration ranges.

Write in prose, not bullets. Precision is the product.

### 2. Connect a Model Node

Add a **Model** node (Processing group) and connect it to the Incubator. Select your provider and model in the Model node. You can use different Model nodes for compilation vs generation — e.g., a powerful reasoning model for the Incubator and a faster one for generation.

### 3. Incubate (Compile)

Connect input nodes to the **Incubator** (edges auto-connect on add). With a Model node connected, click **Generate**. The Incubator sends your connected inputs to the LLM and produces hypothesis strategies.

### 4. Edit Hypotheses

Hypothesis nodes appear to the right of the Incubator. Each represents a variant strategy with:
- **Name** — Editable label (double-click or pencil icon)
- **Hypothesis** — The core design bet
- **Details** (expandable) — Rationale, measurements

Edit these before generation. Remove strategies not worth exploring.

### 5. Add Design System (Optional)

Add a **Design System** node from the toolbar (Processing group). It auto-connects to all existing hypotheses. You can have multiple design system nodes — e.g., one for Material Design tokens, another for a custom system.

- Type or paste design tokens directly into the content area
- Drag-and-drop screenshots of existing design systems, then click **Extract from Images** to have an LLM read the tokens from the images

### 6. Generate Variants

Each hypothesis has built-in generation controls at the bottom. Connect a Model node, then choose your mode:

**Direct (default):** Choose **Direct** in Mode, then **Generate**. The server makes one LLM call and returns a complete self-contained HTML document. Fast — typically 10–30 seconds.

**Agentic:** Switch Mode to **Agentic**, choose a thinking level (None / Light / Deep), then **Run agent**. The agent plans files, writes/edits/validates them, and streams progress to the variant. The **server** then runs **evaluation** (LLM rubrics plus browser QA), and may run **additional revision passes** until scores settle or limits are hit — see **[PRODUCT.md](PRODUCT.md)** for the full pipeline.

Agentic runs take longer (often several minutes) but produce more considered designs. When a run completes, the variant shows an **evaluation summary** and, if Playwright is installed, a small **browser capture** under Runtime QA.

**Output format hint:** If your compiled strategy dimensions include a value for **format** (or `output_format`), it is sent as evaluation context so the server can pick matching **skills** for the agent. Details live in PRODUCT / ARCHITECTURE — you do not need to set this unless you use those dimensions.

Running generation again adds new versions — use the version navigation arrows on the variant card to browse previous results.

**While a run is in flight:** Use **Stop** on the hypothesis or in the variant run workspace to abort the in-flight request for that strategy lane (same as ending the SSE stream).

**Removing nodes from the canvas:** Use **Backspace** or **Delete** with one or more nodes selected. A confirmation explains that removal is **permanent for the canvas** (edges and attached variant nodes may be removed with a hypothesis). The shared spec document is separate; text in section cards may still exist there until you edit it elsewhere.

### 7. Review Variants

Variant nodes render the generated code in sandboxed iframes. Open the **run workspace** (panel icon on the toolbar) for the full timeline, tasks, **Design**/**Evaluation** tabs, and—when an agentic run had several evaluator rounds—a shared **Eval round** control on Design and Evaluation to preview that round’s files and scores.

**Best pick:** If you disagree with the evaluator’s ranking, use **Mark as best** (star on the variant toolbar or “Mark as best” in full-screen). **Clear best pick** restores score-based default for that strategy lane. Full-screen **prev/next design** moves between variant nodes **for the same hypothesis** when domain slots are present.

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
- **Screenshot feedback** — Drag a connection from a variant's right handle to the Existing Design node. This captures a screenshot and adds it as a reference image.
- **Critique** — Add a Critique node, connect a variant to it, write structured feedback (strengths, improvements, direction), then connect the critique to a new Incubator.
- **Re-incubate** — The Incubator reads reference designs and critiques from its connected inputs, producing improved hypotheses.

### Auto-Layout

Toggle the **Auto Layout** checkbox in the header. When on:
- All nodes are positioned automatically based on their connections
- Nodes are not draggable (prevents accidental misalignment)
- Layout updates after compilation, generation, adding/removing nodes, or new connections

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
