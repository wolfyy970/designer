/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** From `package.json` `version` (injected in `vite.config.ts`) */
  readonly VITE_APP_VERSION: string;
  /** HEAD committer time (`git %cI`) or optional `package.json` `releasedAt` */
  readonly VITE_APP_RELEASED_AT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
