/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** From `package.json` `version` (injected in `vite.config.ts`) */
  readonly VITE_APP_VERSION: string;
  /** HEAD committer time (`git %cI`) or optional `package.json` `releasedAt` */
  readonly VITE_APP_RELEASED_AT: string;
  /** Dev only: Hono `PORT` for the Vite proxy (empty in production builds). */
  readonly VITE_DEV_API_PORT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
