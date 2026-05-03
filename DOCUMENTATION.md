# Documentation Philosophy

## Core Principle

**Documentation serves as persistent memory between human and AI collaborators across context windows.** Well-structured docs enable seamless continuation without loss of critical knowledge. **Assistant sessions do not retain prior conversation**—the handoff path is: [AGENTS.md](AGENTS.md) → [PRODUCT.md](PRODUCT.md) → [ARCHITECTURE.md](ARCHITECTURE.md); [README.md](README.md) states this at the top for humans.

**The cardinal rule: Just enough, no more.** Every line must earn its place. If information can be derived from code or official docs, don't duplicate it.

---

## Document Structure

**README.md is the ONLY entry point.** All other docs link from it. No intermediary navigation files.

- **[README.md](README.md)** — Hub and entry point
  - **[SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md)** — Narrative: canvas roles, prompts, agentic loop, evaluation
  - **[PRODUCT.md](PRODUCT.md)** — **North Star** + feature spec (what exists)
  - **[USER_GUIDE.md](USER_GUIDE.md)** — Setup and canvas workflow; **§ Version history** — **`pnpm snap`** for `packages/auto-designer-pi/skills/`, `packages/auto-designer-pi/prompts/`, and rubric weights
  - **[config/README.md](config/README.md)** — Human-editable JSON knobs for product flags, provider/thinking defaults, scoring thresholds, and limits
  - **[meta-harness/VERSIONING.md](meta-harness/VERSIONING.md)** — Meta-harness + `**.prompt-versions/`**: automatic snapshots when proposer or promotion `**P**` writes; same manifest as hand edits
  - **[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)** — SPA design tokens (Indigo palette, light + dark themes): accent vs status, typography triad (body / display / mono / wordmark), atoms (handle, chip, left-rail, buttons, scorecard bar), file-role colors. Visual spec: [Designer Indigo Reference.html](Designer%20Indigo%20Reference.html)
  - **[ARCHITECTURE.md](ARCHITECTURE.md)** — Technical reference: routes, modules, data flow, Pi sandbox (the `@auto-designer/pi` package + tool inventory + edit resilience), preview sessions; **prompt bodies** under `packages/auto-designer-pi/{skills,prompts}/`, resolved via `server/lib/prompt-resolution.ts`
  - **[meta-harness/README.md](meta-harness/README.md)** — Optional **meta-harness** CLI (`pnpm meta-harness`): proposer + runner against the local API; full manual in **[meta-harness/RUNBOOK.md](meta-harness/RUNBOOK.md)** (see README for orientation)
  - **[AGENTS.md](AGENTS.md)** — Canonical conventions for AI coding agents; **[CLAUDE.md](CLAUDE.md)** is a Claude Code stub pointing here
  - **[DOCUMENTATION.md](DOCUMENTATION.md)** — This file (meta only)

---

## Document Types


| Document                                                          | Purpose                                                                                                                                   | Update Trigger                                                                                                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **README.md**                                                     | Entry point, quick start, doc map                                                                                                         | Major features                                                                                                                                                               |
| **PRODUCT.md**                                                    | **North Star** + feature source of truth (prevents hallucination)                                                                         | Feature launches, mission/scope changes                                                                                                                                      |
| **USER_GUIDE.md**                                                 | Setup, canvas workflow, managing specs; **§ Version history** — **`pnpm snap`**                                                                 | UX changes; or editing prompts/skills/rubric by hand                                                                                                                         |
| **config/README.md**                                              | Human-editable JSON configuration knobs and what each file controls                                                                             | New config files, renamed keys, default semantics, or validation behavior                                                                                                     |
| **meta-harness/VERSIONING.md**                                    | How harness writes interact with `**.prompt-versions/`** + skill-local `**_versions/`**                                                 | Meta-harness snapshot / promotion behavior                                                                                                                                   |
| **DESIGN_SYSTEM.md**                                              | SPA token semantics (package shell at `packages/design-system/`: `tokens.json` → generated `:root`/`.dark` CSS; `@theme inline` utility registration in `globals.css`), Indigo palette + sage/amber status, typography triad, atoms (`Button`, `Badge`, handle, rail, scorecard bar), threshold-colored scorecard, DS drift guards | New semantic colors/roles, **font stack / wordmark / display** changes, new atoms, token naming, theme changes                                                                                                |
| **ARCHITECTURE.md**                                               | System design, module boundaries, data flow, Pi sandbox (three-layer contract + tool inventory + edit resilience)                         | Architecture changes                                                                                                                                                         |
| **AGENTS.md**                                                     | Agent-focused commands, Husky semver patch bump, release banner/env, links to **ARCHITECTURE.md** for Pi/sandbox and prompt/skills detail | Workflow, hooks, release metadata, or agent-convention changes                                                                                                               |
| **CLAUDE.md**                                                     | Stub so Claude Code finds guidance → **AGENTS.md**                                                                                        | Only if the pointer or onboarding wording changes                                                                                                                            |
| **meta-harness/README.md** (+ **RUNBOOK.md** + **VERSIONING.md**) | Separate **meta-harness** CLI (not the designer app), config, artifacts                                                                   | Orientation + **RUNBOOK** + **VERSIONING** (harness-side `**.prompt-versions/`**): flags, `history/session-<mode>-*/` layout, promotion report, preflight, proposer strategy |
| **DOCUMENTATION.md**                                              | Meta: documentation philosophy and rules                                                                                                  | Rarely                                                                                                                                                                       |


---

## Writing Rules

**Product vs code names:** In prose, prefer **incubate**, **inputs** (auto-generate), **hypothesis** (strategy card), and **preview** (output node). The codebase may still use historical identifiers (`compileVariantPrompts`, `CompiledPrompt`, `VariantNode.tsx`, CSS `--min-height-variant-node`, etc.) — when docs mention them, label them as **code names** or **legacy**. Client-side visual status for preview cards is `previewNodeStatus` in `node-status.ts`.

1. **One source of truth** — Each fact lives in exactly one place
2. **Link, don't duplicate** — Reference other docs instead of copying
3. **Practical over theoretical** — Working code > abstract explanations
4. **Assume knowledge gaps** — Explain "why" along with "how"
5. **Structure for scanning** — Clear headings, bullets, tables

---

## What NOT to Document

- ❌ Standard library/framework behavior (link to official docs)
- ❌ Obvious code patterns
- ❌ Extensive templates and examples (one suffices)
- ❌ Step-by-step tutorials for common operations
- ❌ Information derivable from reading the code

---

## Maintenance

**Shared modules:** New or renamed `server/lib/*` helpers (e.g. SSE task routes, YAML frontmatter split, Pi bridge narrowers, **`pi-message-helpers`**, **`run-trace-ingest-schema`** (trace POST aligns with `src/lib/run-trace-event-schema.ts`), agentic emit helpers, **`safe-emit.ts`**, **`pi-stream-budget.ts`**, **`session-types.ts`**) and client SSE parsing (`src/lib/generate-sse-event-schema.ts`) belong in **[ARCHITECTURE.md](ARCHITECTURE.md)** — update the server / API client tables there; do not scatter file lists across README. Agentic orchestration lives under **`server/services/agentic-orchestrator/`** (thin **`agentic-orchestrator.ts`** re-export); **`generate-execution.ts`** passes a shared **`streamFailureController`** into **`runAgenticWithEvaluation`** so Pi’s **`effectiveSignal`** and SSE writes agree on delivery failure — note in the server table, not README. Repo skills are host-backed packages (not copied into the just-bash VFS): `use_skill` loads `SKILL.md`, resource tools list/read sibling text files — **ARCHITECTURE.md** / **PRODUCT.md** / **SYSTEM_OVERVIEW.md** / **AGENTS.md**; Pi upstream retries handled inside the package's runner.

**After code changes:**

1. Decide which doc owns the fact (see table above). **Preview run workspace** (overlay dock, open/close, camera padding vs inspector width) and **hypothesis Design** subset **`fitView`** → **USER_GUIDE.md** / **PRODUCT.md** (behavior), **ARCHITECTURE.md** (canvas shell); helpers **`src/lib/canvas-fit-view.ts`**, **`src/components/canvas/CanvasWorkspace.tsx`**. **Stop generation** is documented on the **hypothesis** card only (not duplicated in the run workspace header). **Manual** **`pnpm snap`** (designer repo / hand edits) → **[USER_GUIDE.md § Version history](USER_GUIDE.md#version-history)**. **Meta-harness** writes + manifest semantics → **[meta-harness/VERSIONING.md](meta-harness/VERSIONING.md)**. **Meta-harness CLI** (`meta-harness/`, `pnpm meta-harness`) → **[meta-harness/README.md](meta-harness/README.md)** and **[meta-harness/RUNBOOK.md](meta-harness/RUNBOOK.md)**; a one-line pointer in **[README.md](README.md)** scripts/doc table and **[ARCHITECTURE.md](ARCHITECTURE.md)** is enough for the main repo — do not duplicate the runbook in **SYSTEM_OVERVIEW** / **USER_GUIDE** unless product scope expands. Human-editable JSON files under **`config/`** → **[config/README.md](config/README.md)**, with only a pointer from **README**. **Viewport gate / minimum canvas width (1024px)** → **README.md** (primary), **USER_GUIDE.md**, **PRODUCT.md**; implementation: `ViewportGate` + `src/lib/viewport-gate.ts` — no separate architecture doc unless routing or boundaries change. **API availability gate** (`ApiServerGate`, `**GET /api/config`** before canvas) → **ARCHITECTURE.md** (boundary), **README.md** + **USER_GUIDE.md** (operator one-liner); helpers/tests: `**src/lib/api-server-gate-utils.ts`**, `**src/components/shared/__tests__/ApiServerGate.test.tsx**`. `**apiJsonError**` / `**parse-request**` (structured JSON errors on Hono routes) → **ARCHITECTURE.md** only. Agentic / Pi / sandbox / **preview session** routes and iframe behavior → **ARCHITECTURE.md** + **SYSTEM_OVERVIEW.md**; product-visible preview + eval UX → **PRODUCT.md** / **USER_GUIDE.md**; UX/setup → **USER_GUIDE.md** or **README.md**; SPA color/type semantics, kitchen sink, or new token roles → **DESIGN_SYSTEM.md** (base values stay in `packages/design-system/tokens.json`; derived tokens + `@theme inline` utility registration in `packages/design-system/globals.css`). Optional **input ghosts / spec materialization** → **PRODUCT.md** / **USER_GUIDE.md** (behavior), `**spec-materialize-sections`** + `**canvas-migrations**` tests for logic. `config/feature-flags.json` lockdown / pinned model behavior and `**GET /api/config**` → **README.md** (operator-facing), **USER_GUIDE.md** (canvas impact), **ARCHITECTURE.md** (routes); keep semantics in sync with `config/README.md`, not duplicated here. **Husky patch bump, header version/git timestamp** → **AGENTS.md** only. Canvas **permanent delete** belongs in **USER_GUIDE.md** / **PRODUCT.md**; implementation details belong in **ARCHITECTURE.md** / **AGENTS.md** only. There is **no application database** (Prisma removed). **Prompt bodies** live in the [`@auto-designer/pi`](packages/auto-designer-pi/) package — three real skills under `packages/auto-designer-pi/skills/<key>/SKILL.md` and per-task prompt templates under `packages/auto-designer-pi/prompts/<name>.md` (including `_designer-system.md`) — resolved through `server/lib/prompt-resolution.ts` for callers that ask by `PromptKey` and through `loadPackagePromptBody`/`loadDesignerSystemPrompt` for callers that import the package directly. **Shadow versioning** (`.prompt-versions/manifest.jsonl`, skill-local `_versions/`, `pnpm snap`) → **USER_GUIDE.md** (§ Version history), **AGENTS.md**, one **ARCHITECTURE.md** design-decision note, **meta-harness/README.md** / **RUNBOOK.md** for harness operator flows.
2. **Pi boundary** — All `@mariozechner/pi-ai` / `@mariozechner/pi-coding-agent` use lives inside [`packages/auto-designer-pi/`](packages/auto-designer-pi/) (workspace package, `pi-package` keyword). The host calls it through one entry point: [`server/services/pi-agent-runtime.ts`](server/services/pi-agent-runtime.ts), invoked by [`server/services/agent-runtime.ts`](server/services/agent-runtime.ts). Pi event translation + LLM logging stay host-side under [`server/services/pi-bridge-*.ts`](server/services/) and [`server/services/pi-llm-log.ts`](server/services/pi-llm-log.ts). New Pi-touching work belongs in the package; new host-side glue belongs next to the runtime. If you change the boundary, update **ARCHITECTURE.md** (and **SYSTEM_OVERVIEW.md** when the user-visible flow changes) — do not scatter Pi-specific mentions across other docs.
3. **Long-running deployment** — V1 deployment uses bounded synchronous SSE streams on Vercel Pro. Keep the first-deploy limitations in **README.md** and detailed runtime notes in **ARCHITECTURE.md**; durable async jobs are future v2 work, not the current production contract.
4. Update or remove outdated content; verify cross-references.
5. When a **GET** response shape used by the client changes (e.g. `/api/config`), update `src/api/wire-schemas.ts` (re-exported by `src/api/response-schemas.ts`) and `src/api/__tests__/response-schemas.test.ts`. When splitting or renaming **`src/api/*.ts`** modules, update the **API Client** table in **[ARCHITECTURE.md](ARCHITECTURE.md)** (barrel + `client-rest` / `client-sse` / `client-task-stream` / `client-shared`) — do not list every export in README.
6. **Skill packages:** Each `packages/auto-designer-pi/skills/<key>/SKILL.md` must use valid `---` … `---` YAML frontmatter (see `server/lib/frontmatter-split.ts`). A missing closing fence or markdown headings inside the YAML block causes discovery to skip the package (dev warning) — the `skills_loaded` SSE catalog and the agent's `use_skill` tool will not see it.
7. **Header log viewer** removed — docs point to dev `**/api/logs`** instead; server routes unchanged. Canvas **keyboard delete** (no duplicate React Flow `remove` vs `removeNode`, edge delete without dialog) → **USER_GUIDE.md**; selection guard tests → `src/lib/__tests__/canvas-keyboard-delete.test.ts`.
8. **Hypothesis — one active model edge** (graph + domain + canvas **v25** / workspace domain **v9** migrations) → **[ARCHITECTURE.md](ARCHITECTURE.md)** only; product copy in **README.md** / **USER_GUIDE.md** only if UX-facing.

**Where architecture lives:** Client domain model vs canvas projection, API routes, stores, and data flow live in [ARCHITECTURE.md](ARCHITECTURE.md) only — do not copy that narrative into other docs; link to it. SPA design token **semantics** (accent vs status, typography scale, file-role colors) live in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) only; actual values stay in `packages/design-system/tokens.json` (base) and `packages/design-system/globals.css` (derived).

**Documentation bloat indicators:**

- Same information in multiple places
- Docs describing features that no longer exist
- Sections beginning with "Note: this is outdated..."
- Reader can't find information despite docs existing

**Be ruthless:** Delete obsolete content. Consolidate redundant docs. Prefer focused and impactful over comprehensive.

---

## Success Metrics

Documentation is working when:

- New collaborators understand the project in <10 minutes
- Getting it running takes <15 minutes
- Finding specific information takes <2 minutes
- AI assistants can resume work seamlessly across context windows
