# Skills

Each directory here is a repo-backed Agent Skill package. The live instructions
start in `skills/<key>/SKILL.md` with YAML frontmatter followed by Markdown.
Optional sibling resources can live next to it. Packages are loaded by the
server from disk and exposed to Pi sessions through host-backed skill tools;
they are not copied into the virtual workspace.

## Format

Use the Agent Skills package shape: a skill is a directory with a required
`SKILL.md`, plus optional `references/`, `scripts/`, `assets/`, or `templates/`
files. `SKILL.md` starts with YAML frontmatter, then a concise Markdown body.

```md
---
name: Human-readable skill name
description: Use when ... Covers ...
tags:
  - design
when: auto
---

# Human-readable skill name

Task instructions go here.
```

`name` and `description` are the required Agent Skills fields. This app also
uses `tags` to select skills for each Pi session (`design`, `incubation`,
`internal-context`, `evaluation`, `inputs-gen`, `design-system`) and `when` to
exclude manual-only skills from auto catalogs. `allowed-tools` and
`dependencies` may be present for compatibility/documentation, but Designer does
not enforce tool restrictions or install/run dependencies from skill metadata.

House style:

- Keep frontmatter simple: `name`, `description`, `tags`, `when`.
- Start the body with a single `#` heading matching the skill name.
- Use short sections such as `Mission`, `Grounding`, `Output contract`, and
  `Quality bar` when they make the prompt easier to scan.
- Preserve task-specific output contracts exactly where the consuming code
  depends on them.
- Put large examples, references, templates, scripts, or assets in optional
  sibling folders only when the skill actually needs them.
- Skill resources are host-backed. After `use_skill`, the agent can call
  `list_skill_resources` and `read_skill_resource` for UTF-8 text resources.
  Binary assets are listed but not read as text.
- Scripts under `scripts/` are readable source material only; Designer does not
  execute skill scripts.
- `_versions/`, hidden files, and hidden directories are history/private state
  and are never exposed as runtime skill resources.

## Versioning

Use `pnpm snap` from the repo root to checkpoint prompt-skill changes.

```bash
# edit one or more skills first
pnpm snap
```

`pnpm snap` compares every versioned prompt file to its latest snapshot and saves
only files that changed. Skill snapshots are written next to each skill:

```text
skills/<key>/_versions/<timestamp>.md
```

The same command also versions:

- `prompts/designer-agentic-system/PROMPT.md` into `prompts/designer-agentic-system/_versions/`
- `src/lib/rubric-weights.json` into `.prompt-versions/snapshots/`
- `.prompt-versions/manifest.jsonl`, the append-only manifest for all snapshots

The normal loop is:

```bash
# 1. edit skills/<key>/SKILL.md
pnpm snap
git add skills prompts .prompt-versions
git commit
```

The pre-commit hook runs `pnpm snap --hook` automatically and stages new
snapshot files. To skip that for a one-off commit:

```bash
SKIP_SNAP=1 git commit ...
```

## Inspecting History

```bash
pnpm snap --list skills/<key>/SKILL.md
pnpm snap --diff skills/<key>/SKILL.md <safeTsA> <safeTsB>
pnpm snap --diff-current skills/<key>/SKILL.md
pnpm snap --restore skills/<key>/SKILL.md <safeTs>
```

`safeTs` is the first column printed by `--list`.

## Meta-Harness

Do not run `pnpm snap` before meta-harness writes. The meta-harness proposer and
promotion flow snapshot automatically before overwriting skills, the designer
system prompt, or rubric weights. See `meta-harness/VERSIONING.md` for that path.
