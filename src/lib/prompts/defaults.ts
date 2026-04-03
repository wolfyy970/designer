// ── Prompt keys / metadata (runtime copy lives in DB only) ───────────

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

export interface PromptMeta {
  key: PromptKey;
  label: string;
  description: string;
  variables?: string[];
}

export const PROMPT_META: PromptMeta[] = [
  {
    key: 'compilerSystem',
    label: 'Incubator — System',
    description:
      'System prompt for the Incubator (compiler). Defines the role, task, output format, and guidelines for producing dimension maps.',
  },
  {
    key: 'compilerUser',
    label: 'Incubator — User',
    description: 'User prompt template for the Incubator. Provides the spec data to analyze.',
    variables: [
      'SPEC_TITLE',
      'DESIGN_BRIEF',
      'EXISTING_DESIGN',
      'RESEARCH_CONTEXT',
      'OBJECTIVES_METRICS',
      'DESIGN_CONSTRAINTS',
      'IMAGE_BLOCK',
    ],
  },
  {
    key: 'genSystemHtml',
    label: 'Designer — System',
    description:
      'System prompt for design generation. The model receives this plus the hypothesis/spec context and returns a complete self-contained HTML document.',
  },
  {
    key: 'genSystemHtmlAgentic',
    label: 'Designer — System (Agentic)',
    description:
      'System prompt for agentic multi-file design generation. Instructs the agent to reason about the hypothesis before writing files, then self-critique and revise.',
  },
  {
    key: 'variant',
    label: 'Designer — User',
    description: 'User prompt template for design generation. Provides the hypothesis and spec context.',
    variables: [
      'STRATEGY_NAME',
      'HYPOTHESIS',
      'RATIONALE',
      'MEASUREMENTS',
      'DIMENSION_VALUES',
      'DESIGN_BRIEF',
      'RESEARCH_CONTEXT',
      'IMAGE_BLOCK',
      'OBJECTIVES_METRICS',
      'DESIGN_CONSTRAINTS',
      'DESIGN_SYSTEM',
    ],
  },
  {
    key: 'designSystemExtract',
    label: 'Design System — Extract (system)',
    description:
      'System prompt for extracting design tokens, components, and patterns from uploaded design system screenshots.',
  },
  {
    key: 'designSystemExtractUser',
    label: 'Design System — Extract (user)',
    description: 'User message paired with screenshots for design-system extraction (no template variables).',
  },
  {
    key: 'agentCompactionSystem',
    label: 'Agent — Context compaction',
    description:
      'System prompt for LLM summarization when the agentic session context window is compacted. Defines checkpoint structure.',
  },
  {
    key: 'evalDesignSystem',
    label: 'Evaluator — Design quality',
    description:
      'System prompt for the design-quality evaluator (originality, coherence, craft, usability). Output must be JSON per contract.',
  },
  {
    key: 'evalStrategySystem',
    label: 'Evaluator — Strategy / KPI',
    description:
      'System prompt for hypothesis, KPI, constraint, and design-system adherence scoring. Output must be JSON per contract.',
  },
  {
    key: 'evalImplementationSystem',
    label: 'Evaluator — Implementation',
    description: 'System prompt for static HTML/CSS/JS structural review. Output must be JSON per contract.',
  },
];
