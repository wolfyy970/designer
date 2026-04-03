# Self-hosted Langfuse (optional)

> **This repo defaults to [Langfuse Cloud](https://langfuse.com/docs/deployment/cloud).** Copy `.env.example` → `.env.local`, set `LANGFUSE_BASE_URL` + keys + matching `VITE_LANGFUSE_BASE_URL`, then `pnpm db:seed` (missing prompts only). Use **`pnpm langfuse:sync-prompts`** only when you intend to overwrite Langfuse with repo/SQLite text. Use this Docker stack only if you want everything on your machine (offline, air-gapped, or avoiding a cloud account).

Langfuse runs separately from the auto-designer API (see [Langfuse self-hosting](https://langfuse.com/self-hosting)).

## Quick start (Docker)

From repo root:

```bash
cd docker/langfuse
docker compose up -d
```

Then open **http://localhost:3100**, sign up (first user), create a project, and copy **Public** and **Secret** API keys into `.env.local`:

```env
LANGFUSE_BASE_URL=http://localhost:3100
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

## Ports (avoid clashes)

- **3100** — Langfuse web UI (maps to container 3000)
- **5433** — Postgres for Langfuse only (host bind; app SQLite is unchanged)
- **9090** — MinIO S3 API for Langfuse
- **8123 / 9000** — Clickhouse (localhost-only in compose)

## Seed app prompts into Langfuse

After Langfuse is up and env keys are set:

```bash
pnpm db:seed
```

**`pnpm db:seed`** creates **missing** prompts (or adds a label when versions exist but the deployment label is unset). It does **not** change prompts you edited in Prompt Studio. **`pnpm langfuse:sync-prompts`** runs seed with `LANGFUSE_SEED_SYNC` so every key’s labeled body is replaced when it differs from the import source.

When **creating** new prompt rows, bodies come from `LANGFUSE_PROMPT_IMPORT_SQLITE` (copy of app DB from **before** Prisma prompt tables were dropped — latest `PromptVersion` per key) if set; else `src/lib/prompts/shared-defaults.ts`. If `prisma/dev.db` still has `PromptVersion`, that path is used automatically without the env var.

## Shutdown

```bash
cd docker/langfuse && docker compose down
```
