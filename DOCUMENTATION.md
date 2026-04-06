# Documentation Philosophy

## Core Principle

**Documentation serves as persistent memory between human and AI collaborators across context windows.** Well-structured docs enable seamless continuation without loss of critical knowledge.

**The cardinal rule: Just enough, no more.** Every line must earn its place. If information can be derived from code or official docs, don't duplicate it.

---

## Document Structure

**README.md is the ONLY entry point.** All other docs link from it. No intermediary navigation files.

- **[README.md](README.md)** — Hub and entry point
  - **[LANGFUSE_PROMPTS.md](LANGFUSE_PROMPTS.md)** — Langfuse prompt identifiers → goals (Prompt Studio)
  - **[SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md)** — Narrative: canvas roles, prompts, agentic loop, evaluation
  - **[PRODUCT.md](PRODUCT.md)** — **North Star** + feature spec (what exists)
  - **[USER_GUIDE.md](USER_GUIDE.md)** — Setup and canvas workflow
  - **[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)** — SPA design tokens: accent vs status, typography scale, typeface roles (body / mono / wordmark), file-role colors
  - **[ARCHITECTURE.md](ARCHITECTURE.md)** — Technical reference: routes, modules, data flow
  - **[docker/langfuse/README.md](docker/langfuse/README.md)** — Optional self-hosted Langfuse (most setups use cloud)
  - **[meta-harness/README.md](meta-harness/README.md)** — Optional **meta-harness** CLI (`pnpm meta-harness`): outer optimization loop against the local API; detail in [META_HARNESS_OUTER_LOOP.md](meta-harness/META_HARNESS_OUTER_LOOP.md)
  - **[AGENTS.md](AGENTS.md)** — Canonical conventions for AI coding agents; **[CLAUDE.md](CLAUDE.md)** is a Claude Code stub pointing here
  - **[DOCUMENTATION.md](DOCUMENTATION.md)** — This file (meta only)

---

## Document Types

| Document | Purpose | Update Trigger |
|----------|---------|----------------|
| **README.md** | Entry point, quick start, doc map | Major features |
| **LANGFUSE_PROMPTS.md** | Map Langfuse keys → purpose (Prompt Studio) | Prompt keys/flows change |
| **PRODUCT.md** | **North Star** + feature source of truth (prevents hallucination) | Feature launches, mission/scope changes |
| **USER_GUIDE.md** | Setup, canvas workflow, managing specs | UX changes |
| **DESIGN_SYSTEM.md** | SPA token semantics (`@theme`), severity vs accent, typography scale, typeface roles | New semantic colors/roles, **font stack / wordmark** changes, or token naming |
| **ARCHITECTURE.md** | System design, module boundaries, data flow | Architecture changes |
| **AGENTS.md** | Agent-focused commands, Husky semver patch bump, release banner/env, Pi/Langfuse gotchas | Workflow, hooks, release metadata, or agent-convention changes |
| **CLAUDE.md** | Stub so Claude Code finds guidance → **AGENTS.md** | Only if the pointer or onboarding wording changes |
| **docker/langfuse/README.md** | Optional self-hosted Langfuse (Docker) | Compose stack or seed path changes |
| **meta-harness/README.md** (+ **META_HARNESS_OUTER_LOOP.md**) | Optional benchmark/proposer CLI, config, artifacts | CLI behavior, flags, `history/session-<mode>-*/` layout, promotion report, preflight unpromoted-winner check (diff UI), timeouts / TUI states / proposer strategy |
| **DOCUMENTATION.md** | Meta: documentation philosophy and rules | Rarely |

---

## Writing Rules

**Product vs code names:** In prose, prefer **incubate**, **inputs** (auto-generate), and **preview** (canvas node). The codebase may still use historical identifiers (`compileVariantPrompts`, `CompiledPrompt`, `VariantNode.tsx`, `variantStatus`) — when docs mention them, label them as **code names** or **legacy** so readers are not pulled back to old product language.

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
1. Decide which doc owns the fact (see table above). **Meta-harness CLI** (`meta-harness/`, `pnpm meta-harness`) → **[meta-harness/README.md](meta-harness/README.md)** and **[meta-harness/META_HARNESS_OUTER_LOOP.md](meta-harness/META_HARNESS_OUTER_LOOP.md)**; a one-line pointer in **[README.md](README.md)** scripts/doc table and **[ARCHITECTURE.md](ARCHITECTURE.md)** is enough for the main repo — do not duplicate the runbook in **SYSTEM_OVERVIEW** / **USER_GUIDE** unless product scope expands. **Viewport gate / minimum canvas width (1024px)** → **README.md** (primary), **USER_GUIDE.md**, **PRODUCT.md**; implementation: `ViewportGate` + `src/lib/viewport-gate.ts` — no separate architecture doc unless routing or boundaries change. **`apiJsonError`** / **`parse-request`** (structured JSON errors on Hono routes) → **ARCHITECTURE.md** only. Agentic / Pi / sandbox / **preview session** routes and iframe behavior → **ARCHITECTURE.md** + **SYSTEM_OVERVIEW.md**; product-visible preview + eval UX → **PRODUCT.md** / **USER_GUIDE.md**; UX/setup → **USER_GUIDE.md** or **README.md**; SPA color/type semantics, kitchen sink, or new `@theme` roles → **DESIGN_SYSTEM.md** (values stay in `src/index.css` only). Optional **input ghosts / spec materialization** → **PRODUCT.md** / **USER_GUIDE.md** (behavior), **`spec-materialize-sections`** + **`canvas-migrations`** (v22) tests for logic. **`LOCKDOWN`** / pinned model behavior and **`GET /api/config`** → **README.md** (operator-facing), **USER_GUIDE.md** (canvas impact), **ARCHITECTURE.md** (routes); keep semantics in sync with `.env.example`, not duplicated here. **Husky patch bump, header version/git timestamp** → **AGENTS.md** only. Canvas **permanent delete** and **Stop generation** belong in **USER_GUIDE.md** / **PRODUCT.md**; implementation details belong in **ARCHITECTURE.md** / **AGENTS.md** only. There is **no application database** (Prisma removed); **production** prompt text lives in **Langfuse** (read at runtime); **Prompt Studio** local drafts + per-request **`promptOverrides`** are described in **ARCHITECTURE.md**, **USER_GUIDE.md**, **LANGFUSE_PROMPTS.md**, and **AGENTS.md** — not duplicated here. **`pnpm db:seed`** runs **`scripts/seed-langfuse.ts`**. Repo-root **`skills/`** (Agent Skills packages) is described in **ARCHITECTURE.md**, **SYSTEM_OVERVIEW.md**, and **PRODUCT.md** — not duplicated here.
2. **Pi coding-agent adapter** — Imports of `@mariozechner/pi-ai` / `@mariozechner/pi-coding-agent`, virtual file tools, and stream/session wiring belong under `server/services/pi-sdk/` (`virtual-tools.ts`, `types.ts`, etc.). Orchestration and the rest of the server should not import Pi packages directly. If you change that boundary, update **ARCHITECTURE.md** and **SYSTEM_OVERVIEW.md** (not scattered mentions elsewhere).
3. Update or remove outdated content; verify cross-references.
4. When a **GET** response shape used by the client changes (e.g. `/api/logs`), update `src/api/response-schemas.ts` and `src/api/__tests__/response-schemas.test.ts`.

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
