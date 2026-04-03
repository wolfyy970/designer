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
  - **[PRODUCT.md](PRODUCT.md)** — Feature spec (what exists)
  - **[USER_GUIDE.md](USER_GUIDE.md)** — Setup and canvas workflow
  - **[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)** — SPA design tokens: accent vs status, typography scale, file-role colors
  - **[ARCHITECTURE.md](ARCHITECTURE.md)** — Technical reference: routes, modules, data flow
  - **[docker/langfuse/README.md](docker/langfuse/README.md)** — Optional self-hosted Langfuse (most setups use cloud)
  - **[CLAUDE.md](CLAUDE.md)** — Conventions for AI coding agents (not human onboarding)
  - **[DOCUMENTATION.md](DOCUMENTATION.md)** — This file (meta only)

---

## Document Types

| Document | Purpose | Update Trigger |
|----------|---------|----------------|
| **README.md** | Entry point, quick start, doc map | Major features |
| **LANGFUSE_PROMPTS.md** | Map Langfuse keys → purpose (Prompt Studio) | Prompt keys/flows change |
| **PRODUCT.md** | Feature source of truth (prevents hallucination) | Feature launches |
| **USER_GUIDE.md** | Setup, canvas workflow, managing specs | UX changes |
| **DESIGN_SYSTEM.md** | SPA token semantics (`@theme`), severity vs accent, typography scale | New semantic colors/roles or token naming |
| **ARCHITECTURE.md** | System design, module boundaries, data flow | Architecture changes |
| **CLAUDE.md** | Agent-focused commands and repo gotchas | Workflow or stack shifts |
| **docker/langfuse/README.md** | Optional self-hosted Langfuse (Docker) | Compose stack or seed path changes |
| **DOCUMENTATION.md** | Meta: documentation philosophy and rules | Rarely |

---

## Writing Rules

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
1. Decide which doc owns the fact (see table above). Agentic / Pi / sandbox behavior → **ARCHITECTURE.md** + **SYSTEM_OVERVIEW.md**; product-visible behavior → **PRODUCT.md**; UX/setup → **USER_GUIDE.md** or **README.md**; SPA color/type semantics or new `@theme` roles → **DESIGN_SYSTEM.md** (values stay in `src/index.css` only). Canvas **permanent delete** and **Stop generation** belong in **USER_GUIDE.md** / **PRODUCT.md**; implementation details belong in **ARCHITECTURE.md** / **CLAUDE.md** only. There is **no application database** (Prisma removed); prompts live in **Langfuse**, and **`pnpm db:seed`** runs **`scripts/seed-langfuse.ts`**. Repo-root **`skills/`** (future Agent Skills) is described in **ARCHITECTURE.md** / **PRODUCT.md** — not duplicated here.
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
