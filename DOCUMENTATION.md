# Documentation Philosophy

## Core Principle

**Documentation serves as persistent memory between human and AI collaborators across context windows.** Well-structured docs enable seamless continuation without loss of critical knowledge.

**The cardinal rule: Just enough, no more.** Every line must earn its place. If information can be derived from code or official docs, don't duplicate it.

---

## Document Structure

**README.md is the ONLY entry point.** All other docs link from it. No intermediary navigation files.

```
README.md (Hub)
├── SYSTEM_OVERVIEW.md — End-to-end narrative: prompts, canvas roles, PI agent, evaluation
├── PRODUCT.md         — Feature spec, what exists
├── USER_GUIDE.md      — Setup, canvas workflow, managing specs
├── ARCHITECTURE.md    — System design, data flow, module boundaries, API tables
├── CLAUDE.md          — Conventions for AI coding agents (not a human onboarding path)
└── DOCUMENTATION.md   — This file (meta-documentation)
```

---

## Document Types

| Document | Purpose | Update Trigger |
|----------|---------|----------------|
| **README.md** | Entry point, quick start, doc map | Major features |
| **PRODUCT.md** | Feature source of truth (prevents hallucination) | Feature launches |
| **USER_GUIDE.md** | Setup, canvas workflow, managing specs | UX changes |
| **ARCHITECTURE.md** | System design, module boundaries, data flow | Architecture changes |
| **CLAUDE.md** | Agent-focused commands and repo gotchas | Workflow or stack shifts |
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
1. Check which docs are affected (agentic server behavior → **ARCHITECTURE.md** + **PRODUCT.md** + **SYSTEM_OVERVIEW.md** if the narrative changes; UX/setup → **USER_GUIDE.md** or **README.md**)
2. Update or remove outdated content
3. Verify cross-references still work
4. When a **GET** response shape used by the client changes (e.g. `/api/logs`), update `src/api/response-schemas.ts` and `src/api/__tests__/response-schemas.test.ts`

**Where architecture lives:** Client domain model vs canvas projection, API routes, stores, and data flow are described only in [ARCHITECTURE.md](ARCHITECTURE.md) — avoid duplicating that narrative in other files.

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
