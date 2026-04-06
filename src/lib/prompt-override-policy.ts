/**
 * Local prompt overrides (Settings → Prompts) are **dev-only**. Production UI builds omit that surface,
 * and {@link getActivePromptOverrides} does not forward overrides to the API.
 *
 * Uses Vite’s `import.meta.env.PROD` (true for `pnpm build` / deployed static assets).
 */
export const isPromptOverrideEditingEnabled = !import.meta.env.PROD;
