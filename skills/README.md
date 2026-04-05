# Agent skills (repo-backed)

Skill packages live under `skills/<key>/SKILL.md` with YAML frontmatter.

At each agentic Pi session boundary, the API **walks this directory**, parses valid packages, and:

- **Catalog:** Embeds **`<available_skills>`** in the Pi **`use_skill`** tool description (not the main system prompt) for every skill except **`when: manual`** (each row includes `key`, name, path, description).
- **Sandbox:** Pre-seeds all of those packages (markdown body + eligible small reference files) under **`skills/<key>/…`** in **just-bash** before the agent runs.

The agent should call **`use_skill`** with the skill **name** (directory key) when a description matches the hypothesis or milestones. **`read`** on `skills/…/SKILL.md` still works; **`use_skill`** is the preferred activation path.

- **`when: auto`** / **`when: always`** — Included in the tool catalog and pre-seeded (`always` vs `auto` is metadata for authors; both are in the sandbox).
- **`when: manual`** — Omitted from the catalog and seed until a future UI toggle includes them.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the full flow.

## Frontmatter

| Field | Required | Notes |
|-------|----------|--------|
| `name` | yes | Short display name |
| `description` | yes | **Routing signal:** when to activate — lead with “Use when…” / “Activate for…” so the model matches tasks reliably (see below) |
| `tags` | no | Keywords (optional; future filtering) |
| `when` | no | `auto` (default), `always`, or `manual` |

## Authoring descriptions (activation)

Vague descriptions lead to missed activations. Prefer **trigger-oriented** copy the model can pattern-match against the hypothesis:

- Good: `Use when building forms or keyboard-navigable UI. Activate for semantic structure, focus, or ARIA.`
- Weak: `Best practices for HTML.` (does not say *when* to load the skill)

Add a new directory with `SKILL.md`. The next **Generate** or revision round picks it up automatically—no server restart.

Optional extra text files (`.html`, `.css`, `.md`, etc.) in the same folder are copied into the sandbox beside `SKILL.md` when the package is seeded (size limits apply on the server).
