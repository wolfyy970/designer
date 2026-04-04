/**
 * Prompt keys only — runtime bodies come from Langfuse via `getPromptBody` when configured,
 * else from `src/lib/prompts/shared-defaults.ts` (bodies used when **creating** missing prompts via `pnpm db:seed`).
 */
export type PromptKey =
  | 'hypotheses-generator-system'
  | 'incubator-user-inputs'
  | 'designer-direct-system'
  | 'designer-agentic-system'
  | 'designer-hypothesis-inputs'
  | 'design-system-extract-system'
  | 'design-system-extract-user-input'
  | 'agent-context-compaction'
  | 'agents-md-file'
  | 'evaluator-design-quality'
  | 'evaluator-strategy-fidelity'
  | 'evaluator-implementation';

/** Canonical ordered list (keep aligned with client `PROMPT_META`). */
export const PROMPT_KEYS: PromptKey[] = [
  'hypotheses-generator-system',
  'incubator-user-inputs',
  'designer-direct-system',
  'designer-agentic-system',
  'designer-hypothesis-inputs',
  'design-system-extract-system',
  'design-system-extract-user-input',
  'agent-context-compaction',
  'agents-md-file',
  'evaluator-design-quality',
  'evaluator-strategy-fidelity',
  'evaluator-implementation',
];
