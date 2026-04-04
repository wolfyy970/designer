import type { SpecSectionId, SpecSectionMeta } from '../types/spec';

export const SPEC_SECTIONS: SpecSectionMeta[] = [
  {
    id: 'design-brief',
    title: 'Design Brief',
    description:
      'State the design challenge, who it is for, and the outcome you want.',
    required: true,
  },
  {
    id: 'existing-design',
    title: 'Existing Design',
    description:
      "Today's baseline: what works, what fails, and notes or screenshots of the current experience.",
    required: false,
  },
  {
    id: 'research-context',
    title: 'Research & Context',
    description:
      "Who you're designing for, what they need, and why today's options fall short.",
    required: false,
  },
  {
    id: 'objectives-metrics',
    title: 'Objectives & Metrics',
    description:
      "Success for the business and user: goals, KPIs, how you'll measure, and timeframe.",
    required: false,
  },
  {
    id: 'design-constraints',
    title: 'Design Constraints',
    description:
      'Non-negotiables versus what may vary—brand, accessibility, legal limits, and exploration axes.',
    required: false,
  },
  {
    id: 'design-system',
    title: 'Design System',
    description:
      'Tokens, components, and patterns: describe them here or capture from screenshots elsewhere.',
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
