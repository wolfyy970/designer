/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** From `package.json` `version` (injected in `vite.config.ts`) */
  readonly VITE_APP_VERSION: string;
  /** HEAD committer time (`git %cI`) or optional `package.json` `releasedAt` */
  readonly VITE_APP_RELEASED_AT: string;
  /** Dev only: Hono `PORT` for the Vite proxy (empty in production builds). */
  readonly VITE_DEV_API_PORT: string;
  /**
   * LogRocket app id (`org/app`). When unset in development, LogRocket stays off unless you set this.
   * Production builds use `qbwhsc/designer-6dify` when this is empty.
   */
  readonly VITE_LOGROCKET_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module '../assets/default-wireframe-design.md?raw' {
  const content: string;
  export default content;
}
