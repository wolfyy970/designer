# `.prompt-versions/`

- **`manifest.jsonl`** — Append-only log of every snapshot (manual, **`pnpm snap`**, meta-harness, promotion).
- **`snapshots/`** — Snapshot files for **`src/lib/rubric-weights.json`** only (skills and `PROMPT.md` use **`_versions/`** next to those files).

**You edit by hand:** **[USER_GUIDE.md § Version history](../USER_GUIDE.md#version-history)** — **`pnpm snap`**

**Meta-harness:** **[meta-harness/VERSIONING.md](../meta-harness/VERSIONING.md)**
