# Documentation Philosophy

## Core Principle

**Documentation serves as persistent memory between human and AI collaborators across context windows.** Well-structured docs enable seamless continuation without loss of critical knowledge.

**The cardinal rule: Just enough, no more.** Every line must earn its place. If information can be derived from code or official docs, don't duplicate it.

---

## Document Structure

**README.md is the ONLY entry point.** All other docs link from it. No intermediary navigation files.

- **[README.md](README.md)** — Hub and entry point
  - **[SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md)** — Narrative: canvas roles, prompts, agentic loop, evaluation
  - **[PRODUCT.md](PRODUCT.md)** — **North Star** + feature spec (what exists)
  - **[USER_GUIDE.md](USER_GUIDE.md)** — Setup and canvas workflow; **§ Version history** — **`pnpm snap`** for `**skills/**`, `**PROMPT.md**`, rubric weights
  - **[meta-harness/VERSIONING.md](meta-harness/VERSIONING.md)** — Meta-harness + `**.prompt-versions/`**: automatic snapshots when proposer or promotion `**P**` writes; same manifest as hand edits
  - **[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)** — SPA design tokens: accent vs status, typography scale, typeface roles (body / mono / wordmark), file-role colors
  - **[ARCHITECTURE.md](ARCHITECTURE.md)** — Technical reference: routes, modules, data flow, Pi sandbox (layers + tool inventory + edit resilience), preview sessions; **prompt bodies** in `**skills/*/SKILL.md`** + `**prompts/designer-agentic-system/PROMPT.md**`, resolved via `**server/lib/prompt-resolution.ts**`
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
| **meta-harness/VERSIONING.md**                                    | How harness writes interact with `**.prompt-versions/`** + skill-local `**_versions/`**                                                 | Meta-harness snapshot / promotion behavior                                                                                                                                   |
| **DESIGN_SYSTEM.md**                                              | SPA token semantics (`@theme`), severity vs accent, typography scale, typeface roles                                                      | New semantic colors/roles, **font stack / wordmark** changes, or token naming                                                                                                |
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

**After code changes:**

1. Decide which doc owns the fact (see table above). **Manual** **`pnpm snap`** (designer repo / hand edits) → **[USER_GUIDE.md § Version history](USER_GUIDE.md#version-history)**. **Meta-harness** writes + manifest semantics → **[meta-harness/VERSIONING.md](meta-harness/VERSIONING.md)**. **Meta-harness CLI** (`meta-harness/`, `pnpm meta-harness`) → **[meta-harness/README.md](meta-harness/README.md)** and **[meta-harness/RUNBOOK.md](meta-harness/RUNBOOK.md)**; a one-line pointer in **[README.md](README.md)** scripts/doc table and **[ARCHITECTURE.md](ARCHITECTURE.md)** is enough for the main repo — do not duplicate the runbook in **SYSTEM_OVERVIEW** / **USER_GUIDE** unless product scope expands. **Viewport gate / minimum canvas width (1024px)** → **README.md** (primary), **USER_GUIDE.md**, **PRODUCT.md**; implementation: `ViewportGate` + `src/lib/viewport-gate.ts` — no separate architecture doc unless routing or boundaries change. **API availability gate** (`ApiServerGate`, `**GET /api/config`** before canvas) → **ARCHITECTURE.md** (boundary), **README.md** + **USER_GUIDE.md** (operator one-liner); helpers/tests: `**src/lib/api-server-gate-utils.ts`**, `**src/components/shared/__tests__/ApiServerGate.test.tsx**`. `**apiJsonError**` / `**parse-request**` (structured JSON errors on Hono routes) → **ARCHITECTURE.md** only. Agentic / Pi / sandbox / **preview session** routes and iframe behavior → **ARCHITECTURE.md** + **SYSTEM_OVERVIEW.md**; product-visible preview + eval UX → **PRODUCT.md** / **USER_GUIDE.md**; UX/setup → **USER_GUIDE.md** or **README.md**; SPA color/type semantics, kitchen sink, or new `@theme` roles → **DESIGN_SYSTEM.md** (values stay in `src/index.css` only). Optional **input ghosts / spec materialization** → **PRODUCT.md** / **USER_GUIDE.md** (behavior), `**spec-materialize-sections`** + `**canvas-migrations**` (v22) tests for logic. `**LOCKDOWN**` / pinned model behavior and `**GET /api/config**` → **README.md** (operator-facing), **USER_GUIDE.md** (canvas impact), **ARCHITECTURE.md** (routes); keep semantics in sync with `.env.example`, not duplicated here. **Husky patch bump, header version/git timestamp** → **AGENTS.md** only. Canvas **permanent delete** and **Stop generation** belong in **USER_GUIDE.md** / **PRODUCT.md**; implementation details belong in **ARCHITECTURE.md** / **AGENTS.md** only. There is **no application database** (Prisma removed). **Prompt bodies** live in repo `**skills/*/SKILL.md`** and `**prompts/designer-agentic-system/PROMPT.md**`, loaded by `**server/lib/prompt-resolution.ts**` — see **ARCHITECTURE.md**, **USER_GUIDE.md**, **SYSTEM_OVERVIEW.md**. Repo-root `**skills/`** (Agent Skills packages) is described in **ARCHITECTURE.md**, **SYSTEM_OVERVIEW.md**, and **PRODUCT.md** — not duplicated here. **Shadow versioning** (`**.prompt-versions/manifest.jsonl`**, skill-local `**_versions/`**, **`pnpm snap`**) → **USER_GUIDE.md** (§ Version history), **AGENTS.md**, one **ARCHITECTURE.md** design-decision note, **meta-harness/README.md** / **RUNBOOK.md** for harness operator flows.
2. **Pi coding-agent adapter** — Imports of `@mariozechner/pi-ai` / `@mariozechner/pi-coding-agent`, virtual file tools, and stream/session wiring belong under `server/services/pi-sdk/` (`virtual-tools.ts`, `types.ts`, etc.). Orchestration and the rest of the server should not import Pi packages directly. If you change that boundary, update **ARCHITECTURE.md** and **SYSTEM_OVERVIEW.md** (not scattered mentions elsewhere).
3. Update or remove outdated content; verify cross-references.
4. When a **GET** response shape used by the client changes (e.g. `/api/config`), update `src/api/response-schemas.ts` and `src/api/__tests__/response-schemas.test.ts`.
5. **Header log viewer** removed — docs point to dev `**/api/logs`** instead; server routes unchanged. Canvas **keyboard delete** (no duplicate React Flow `remove` vs `removeNode`, edge delete without dialog) → **USER_GUIDE.md**; selection guard tests → `src/lib/__tests__/canvas-keyboard-delete.test.ts`.

**Where architecture lives:** Client domain model vs canvas projection, API routes, stores, and data flow live in [ARCHITECTURE.md](ARCHITECTURE.md) only — do not copy that narrative into other docs; link to it. SPA design token **semantics** (accent vs status, typography scale, file-role colors) live in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) only; actual values stay in `src/index.css`.

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