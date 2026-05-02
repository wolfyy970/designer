// ── Prompt keys (shared type contract between client and server) ─────

export type PromptKey =
  | 'hypotheses-generator-system'
  | 'incubator-user-inputs'
  | 'designer-agentic-system'
  | 'designer-agentic-revision-user'
  | 'designer-hypothesis-inputs'
  | 'design-system-extract-system'
  | 'design-system-extract-user-input'
  | 'agents-md-file'
  | 'evaluator-design-quality'
  | 'evaluator-strategy-fidelity'
  | 'evaluator-implementation'
  | 'inputs-gen-research-context'
  | 'inputs-gen-objectives-metrics'
  | 'inputs-gen-design-constraints';

export const PROMPT_KEYS: PromptKey[] = [
  'hypotheses-generator-system',
  'incubator-user-inputs',
  'designer-agentic-system',
  'designer-agentic-revision-user',
  'designer-hypothesis-inputs',
  'design-system-extract-system',
  'design-system-extract-user-input',
  'agents-md-file',
  'evaluator-design-quality',
  'evaluator-strategy-fidelity',
  'evaluator-implementation',
  'inputs-gen-research-context',
  'inputs-gen-objectives-metrics',
  'inputs-gen-design-constraints',
];
