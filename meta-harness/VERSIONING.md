# Meta-harness and `.prompt-versions/`

This document is **only for the meta-harness CLI** (`pnpm meta-harness`) — the separate benchmark/proposer app under `**meta-harness/`**. It does **not** describe the canvas **designer** UI; that lives in **[USER_GUIDE.md](../USER_GUIDE.md)**.

The **designer app** and **meta-harness** share repo files (`skills/`, `PROMPT.md`, `rubric-weights.json`) and a committed shadow store: **`manifest.jsonl`** at repo root, skill/PROMPT snapshots under **`_versions/`** next to those files, and rubric snapshots under **`.prompt-versions/snapshots/`**. Meta-harness **automatically** appends snapshots before it overwrites those files.

---

## What meta-harness does automatically

When the **proposer** uses **`write_skill`**, **`delete_skill`**, or **`write_system_prompt`**, or when you press **`P`** in preflight promotion, the runner calls **`snapshotBeforeWrite`** (**[version-store.ts](./version-store.ts)**) from **[proposer-tools.ts](./proposer-tools.ts)** and **[apply-promotion.ts](./apply-promotion.ts)**.

You do **not** run **`pnpm snap`** before a harness run or before **`P`** — the prior file contents are saved immediately before each overwrite.

Each snapshot appends a JSON line to **`.prompt-versions/manifest.jsonl`**. The **`source`** field records which code path wrote the snapshot (for example proposer vs promotion). Inspect history with **`pnpm snap --list`** / **`--diff`** from the repo root (same CLI as manual checkpoints).

---

## When you edit the same files by hand

If you change **`skills/`**, **`prompts/designer-agentic-system/PROMPT.md`**, or **`src/lib/rubric-weights.json`** in an editor **without** meta-harness writing them, use **`pnpm snap`** after you edit — see **[USER_GUIDE.md § Version history](../USER_GUIDE.md#version-history)**.

If you run meta-harness and **later** hand-edit a file, run **`pnpm snap`** when you want a checkpoint (same USER_GUIDE section).

---

## Related (meta-harness)

- **[README.md](./README.md)** — CLI overview, modes diagram  
- **[RUNBOOK.md](./RUNBOOK.md)** — Full runbook: preflight, `**P`**, tunable surfaces

