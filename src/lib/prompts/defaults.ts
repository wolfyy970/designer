// ── Prompt keys / metadata (runtime copy lives in DB only) ───────────

export type PromptKey =
  | 'hypotheses-generator-system'
  | 'incubator-user-inputs'
  | 'designer-agentic-system'
  | 'designer-agentic-revision-user'
  | 'designer-hypothesis-inputs'
  | 'design-system-extract-system'
  | 'design-system-extract-user-input'
  | 'agent-context-compaction'
  | 'agents-md-file'
  | 'evaluator-design-quality'
  | 'evaluator-strategy-fidelity'
  | 'evaluator-implementation'
  | 'inputs-gen-research-context'
  | 'inputs-gen-objectives-metrics'
  | 'inputs-gen-design-constraints';

export interface PromptMeta {
  key: PromptKey;
  label: string;
  description: string;
  variables?: string[];
}

export const PROMPT_META: PromptMeta[] = [
  {
    key: 'hypotheses-generator-system',
    label: 'Incubator — Hypotheses generator (system)',
    description:
      'System prompt for the Incubator incubate step: read the five-section spec and return a JSON incubation plan (dimensions, ranges, hypothesis strategies).',
  },
  {
    key: 'incubator-user-inputs',
    label: 'Incubator — Spec inputs (user)',
    description:
      'User prompt template for the Incubator. Interpolates spec sections and optional run-time blocks (reference designs from prior iterations, existing hypothesis strategies to differentiate against, exact hypothesis count). Empty blocks omit their section.',
    variables: [
      'SPEC_TITLE',
      'DESIGN_BRIEF',
      'EXISTING_DESIGN',
      'RESEARCH_CONTEXT',
      'OBJECTIVES_METRICS',
      'DESIGN_CONSTRAINTS',
      'IMAGE_BLOCK',
      'REFERENCE_DESIGNS_BLOCK',
      'EXISTING_HYPOTHESES_BLOCK',
      'INCUBATOR_HYPOTHESIS_COUNT_LINE',
    ],
  },
  {
    key: 'designer-agentic-system',
    label: 'Designer — Agentic (system)',
    description:
      'System prompt for Agentic mode: mission, tools, workflow, self-critique, and design-quality bar for the multi-file agent.',
  },
  {
    key: 'designer-agentic-revision-user',
    label: 'Designer — Agentic revision (user)',
    description:
      'User instructions appended on post-evaluation revision rounds (after the compiled hypothesis context and before the revision brief).',
  },
  {
    key: 'designer-hypothesis-inputs',
    label: 'Designer — Hypothesis (user)',
    description:
      'User prompt for agentic generation: hypothesis, dimension values, and full spec context for the specific design to build.',
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
    key: 'design-system-extract-system',
    label: 'Design system extract — System',
    description:
      'System prompt for screenshot extraction: analyze UI images and return structured JSON design tokens and patterns.',
  },
  {
    key: 'design-system-extract-user-input',
    label: 'Design system extract — User',
    description: 'Short user message paired with screenshots for extraction (no template variables).',
  },
  {
    key: 'agent-context-compaction',
    label: 'Agent — Context compaction',
    description:
      'Supplementary “Additional focus” for Pi’s compaction summarizer (wired in `designer-compaction-extension.ts`). Adds structured <designer_checkpoint> tags, verbatim goal/errors, and a rehydration list — keep additive; Pi already supplies the base section template.',
  },
  {
    key: 'agents-md-file',
    label: 'Agent — AGENTS.md seed',
    description:
      'Seeded as AGENTS.md in the virtual workspace: static HTML/CSS/JS limits, no npm or frameworks, Google Fonts only, etc.',
  },
  {
    key: 'evaluator-design-quality',
    label: 'Evaluator — Design quality',
    description:
      'Rubric for subjective design critique: design_quality, originality, craft, usability (1–5). JSON output per contract.',
  },
  {
    key: 'evaluator-strategy-fidelity',
    label: 'Evaluator — Strategy fidelity',
    description:
      'Rubric for hypothesis, KPI, constraint, and design-system adherence. JSON output per contract.',
  },
  {
    key: 'evaluator-implementation',
    label: 'Evaluator — Implementation',
    description: 'Rubric for static HTML/CSS/JS engineering review. JSON output per contract.',
  },
  {
    key: 'inputs-gen-research-context',
    label: 'Inputs — Generate research context (system)',
    description:
      'Auto-fill Research Context from the design brief: plausible user/context narrative without fabricating studies or data.',
    variables: [
      'DESIGN_BRIEF',
      'EXISTING_DESIGN',
      'RESEARCH_CONTEXT',
      'OBJECTIVES_METRICS',
      'DESIGN_CONSTRAINTS',
    ],
  },
  {
    key: 'inputs-gen-objectives-metrics',
    label: 'Inputs — Generate objectives & metrics (system)',
    description:
      'Auto-fill Objectives & Metrics from the design brief: measurable outcomes and success signals, no invented KPI numbers.',
    variables: [
      'DESIGN_BRIEF',
      'EXISTING_DESIGN',
      'RESEARCH_CONTEXT',
      'OBJECTIVES_METRICS',
      'DESIGN_CONSTRAINTS',
    ],
  },
  {
    key: 'inputs-gen-design-constraints',
    label: 'Inputs — Generate design constraints (system)',
    description:
      'Auto-fill Design Constraints from the design brief: non-negotiables and exploration ranges grounded in the brief.',
    variables: [
      'DESIGN_BRIEF',
      'EXISTING_DESIGN',
      'RESEARCH_CONTEXT',
      'OBJECTIVES_METRICS',
      'DESIGN_CONSTRAINTS',
    ],
  },
];

export const PROMPT_KEYS: PromptKey[] = PROMPT_META.map((m) => m.key);

/**
 * Legacy Langfuse / SQLite prompt names before kebab-case rename.
 Still accepted by `parsePromptKey` (e.g. deep links). Used by seed migration and legacy DB import.
 */
export const LEGACY_PROMPT_KEY_ALIASES = {
  compilerSystem: 'hypotheses-generator-system',
  compilerUser: 'incubator-user-inputs',
  genSystemHtml: 'designer-agentic-system',
  genSystemHtmlAgentic: 'designer-agentic-system',
  variant: 'designer-hypothesis-inputs',
  designSystemExtract: 'design-system-extract-system',
  designSystemExtractUser: 'design-system-extract-user-input',
  agentCompactionSystem: 'agent-context-compaction',
  sandboxAgentsContext: 'agents-md-file',
  evalDesignSystem: 'evaluator-design-quality',
  evalStrategySystem: 'evaluator-strategy-fidelity',
  evalImplementationSystem: 'evaluator-implementation',
  'section-gen-research-context': 'inputs-gen-research-context',
  'section-gen-objectives-metrics': 'inputs-gen-objectives-metrics',
  'section-gen-design-constraints': 'inputs-gen-design-constraints',
} as const satisfies Record<string, PromptKey>;
