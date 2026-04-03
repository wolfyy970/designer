/**
 * Prompt keys only — runtime bodies come from Langfuse via `getPromptBody` when configured,
 * else from `src/lib/prompts/shared-defaults.ts` (same text used for `pnpm db:seed`).
 */
export type PromptKey =
  | 'compilerSystem'
  | 'compilerUser'
  | 'genSystemHtml'
  | 'genSystemHtmlAgentic'
  | 'variant'
  | 'designSystemExtract'
  | 'designSystemExtractUser'
  | 'agentCompactionSystem'
  | 'evalDesignSystem'
  | 'evalStrategySystem'
  | 'evalImplementationSystem';

/** Canonical ordered list (keep aligned with client `PROMPT_META`). */
export const PROMPT_KEYS: PromptKey[] = [
  'compilerSystem',
  'compilerUser',
  'genSystemHtml',
  'genSystemHtmlAgentic',
  'variant',
  'designSystemExtract',
  'designSystemExtractUser',
  'agentCompactionSystem',
  'evalDesignSystem',
  'evalStrategySystem',
  'evalImplementationSystem',
];
