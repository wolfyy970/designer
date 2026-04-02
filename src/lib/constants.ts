import type { SpecSectionId, SpecSectionMeta } from '../types/spec';

export const SPEC_SECTIONS: SpecSectionMeta[] = [
  {
    id: 'design-brief',
    title: 'Design Brief',
    description:
      'What do you want to design? The primary directive — describe the design challenge, target experience, and desired outcome.',
    required: true,
  },
  {
    id: 'existing-design',
    title: 'Existing Design',
    description:
      'What exists today. Screenshots, what works, what fails, what prompted this redesign.',
    required: false,
  },
  {
    id: 'research-context',
    title: 'Research & Context',
    description:
      'Who is the user, what do they need, and what do we know? Decision context, user intent, behavioral insights, supporting research, why current solutions fail.',
    required: true,
  },
  {
    id: 'objectives-metrics',
    title: 'Objectives & Metrics',
    description:
      'What success looks like for the business and user. Goals, primary KPIs, secondary metrics, evaluation criteria, time horizon.',
    required: true,
  },
  {
    id: 'design-constraints',
    title: 'Design Constraints',
    description:
      'Boundaries and exploration space. Non-negotiable requirements (brand, accessibility, legal, ethical) plus what may vary across variants (layout, messaging, interaction patterns, visual treatment).',
    required: true,
  },
  {
    id: 'design-system',
    title: 'Design System',
    description:
      'Design tokens, components, patterns, and visual language. Drop screenshots to auto-extract, or describe manually.',
    required: false,
  },
];

// Proxy base paths (must match vite.config.ts proxy entries)
export const OPENROUTER_PROXY = '/openrouter-api';
export const LMSTUDIO_PROXY = '/lmstudio-api';

// Default providers
export const DEFAULT_COMPILER_PROVIDER = import.meta.env.VITE_DEFAULT_COMPILER_PROVIDER || 'openrouter';
export const DEFAULT_GENERATION_PROVIDER = import.meta.env.VITE_DEFAULT_GENERATION_PROVIDER || 'lmstudio';

// Default model for auto-created Model nodes (OpenRouter ID)
export const DEFAULT_MODEL_ID = import.meta.env.VITE_DEFAULT_MODEL_ID || 'z-ai/glm-5';

/**
 * Default node data for each auto-created prerequisite type.
 * Keyed by node type — extend this map when adding new prerequisite rules.
 */
export const PREREQUISITE_DEFAULTS: Record<string, Record<string, unknown>> = {
  model: { providerId: DEFAULT_COMPILER_PROVIDER, modelId: DEFAULT_MODEL_ID, thinkingLevel: 'minimal' },
  hypothesis: { agentMode: 'single' },
};


// UI timing constants
/** Duration of the fitView animation after nodes are added to the canvas (ms). */
export const FIT_VIEW_DURATION_MS = 400;
/** Delay before triggering fitView after nodes are placed, to let layout settle (ms). */
export const FIT_VIEW_DELAY_MS = 200;
/** Debounce delay for auto-layout recalculation on dimension changes (ms). */
export const AUTO_LAYOUT_DEBOUNCE_MS = 200;
/** Duration to show transient copy/save feedback indicators (ms). */
export const FEEDBACK_DISMISS_MS = 1500;
/** Delay for iframe to fully render before screenshot capture (ms). */
export const SCREENSHOT_LOAD_DELAY_MS = 3000;

function createEmptySection(id: SpecSectionId) {
  return {
    id,
    content: '',
    images: [],
    lastModified: new Date().toISOString(),
  };
}

export function createEmptySections() {
  return Object.fromEntries(
    SPEC_SECTIONS.map((s) => [s.id, createEmptySection(s.id)])
  ) as Record<SpecSectionId, ReturnType<typeof createEmptySection>>;
}
