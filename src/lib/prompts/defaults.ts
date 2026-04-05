// ── Prompt keys / metadata (runtime copy lives in DB only) ───────────

export type PromptKey =
  | 'hypotheses-generator-system'
  | 'incubator-user-inputs'
  | 'designer-direct-system'
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
  | 'section-gen-research-context'
  | 'section-gen-objectives-metrics'
  | 'section-gen-design-constraints';

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
      'System prompt for the Incubator compile step: read the five-section spec and return a JSON incubation plan (dimensions, ranges, hypothesis strategies).',
  },
  {
    key: 'incubator-user-inputs',
    label: 'Incubator — Spec inputs (user)',
    description:
      'User prompt template for the Incubator. Interpolates brief, constraints, research, objectives, and images as the data payload.',
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
    key: 'designer-direct-system',
    label: 'Designer — Direct / single-shot (system)',
    description:
      'System prompt for Direct mode: return one self-contained HTML document with inline CSS and allowlisted Google Fonts only.',
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
      'User prompt for Direct and Agentic generation: hypothesis, dimension values, and full spec context for the specific design to build.',
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
      'When the agentic session truncates history, defines how to summarize prior work into a checkpoint (Goal, Progress, Decisions, Next Steps).',
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
    key: 'section-gen-research-context',
    label: 'Section — Generate research context (system)',
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
    key: 'section-gen-objectives-metrics',
    label: 'Section — Generate objectives & metrics (system)',
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
    key: 'section-gen-design-constraints',
    label: 'Section — Generate design constraints (system)',
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
  genSystemHtml: 'designer-direct-system',
  genSystemHtmlAgentic: 'designer-agentic-system',
  variant: 'designer-hypothesis-inputs',
  designSystemExtract: 'design-system-extract-system',
  designSystemExtractUser: 'design-system-extract-user-input',
  agentCompactionSystem: 'agent-context-compaction',
  sandboxAgentsContext: 'agents-md-file',
  evalDesignSystem: 'evaluator-design-quality',
  evalStrategySystem: 'evaluator-strategy-fidelity',
  evalImplementationSystem: 'evaluator-implementation',
} as const satisfies Record<string, PromptKey>;
