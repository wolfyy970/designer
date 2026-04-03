# Agent skills (repo-backed)

Skill packages live under `skills/<key>/SKILL.md` with YAML frontmatter.

At each agentic Pi session boundary, the API **walks this directory**, parses valid packages, and:

- **Catalog:** Adds an **`<available_skills>`** block to the agentic system prompt for every skill except **`when: manual`** (each row includes a workspace **`path`** like `skills/<key>/SKILL.md`).
- **Sandbox:** Pre-seeds all of those packages (markdown body + eligible small reference files) under **`skills/<key>/…`** in **just-bash** before the agent runs.

The agent should use the normal **`read`** tool on a skill path when that skill’s description matches the task—not read every skill up front.

- **`when: auto`** / **`when: always`** — Included in the catalog and pre-seeded (`always` vs `auto` is metadata for authors; both are in the sandbox).
- **`when: manual`** — Omitted from the catalog and seed until a future UI toggle includes them.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the full flow.

## Frontmatter

| Field | Required | Notes |
|-------|----------|--------|
| `name` | yes | Short display name |
| `description` | yes | Shown in catalog + UI |
| `tags` | no | Keywords (optional; future filtering) |
| `when` | no | `auto` (default), `always`, or `manual` |

## Authoring

Add a new directory with `SKILL.md`. The next **Generate** or revision round picks it up automatically—no server restart.

Optional extra text files (`.html`, `.css`, `.md`, etc.) in the same folder are copied into the sandbox beside `SKILL.md` when the package is seeded (size limits apply on the server).
