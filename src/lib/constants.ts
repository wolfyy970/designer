import type { SpecSectionId, SpecSectionMeta } from '../types/spec';
import {
  DEFAULT_COMPILER_PROVIDER as PROVIDER_FROM_CONFIG,
  DEFAULT_MODEL_ID as MODEL_ID_FROM_CONFIG,
} from './provider-defaults';

export const SPEC_SECTIONS: SpecSectionMeta[] = [
  {
    id: 'design-brief',
    title: 'Design Brief',
    description:
      'State the design challenge, who it is for, and the outcome you want.',
    required: true,
  },
  {
    id: 'research-context',
    title: 'Research & Context',
    description: 'Related research and/or context.',
    required: false,
  },
  {
    id: 'objectives-metrics',
    title: 'Objectives & Metrics',
    description: 'How you will measure the success of the design.',
    required: false,
  },
  {
    id: 'design-constraints',
    title: 'Design Constraints',
    description: 'Non-negotiables versus what may vary.',
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

// Default provider / model for auto-created Model nodes.
// Sourced from config/provider-defaults.json (validated at module load).
export const DEFAULT_INCUBATOR_PROVIDER = PROVIDER_FROM_CONFIG;
/** @deprecated Use {@link DEFAULT_INCUBATOR_PROVIDER} */
export const DEFAULT_COMPILER_PROVIDER = PROVIDER_FROM_CONFIG;
export const DEFAULT_MODEL_ID = MODEL_ID_FROM_CONFIG;

/**
 * Default node data for each auto-created prerequisite type.
 * Keyed by node type — extend this map when adding new prerequisite rules.
 */
export const PREREQUISITE_DEFAULTS: Record<string, Record<string, unknown>> = {
  model: { providerId: DEFAULT_INCUBATOR_PROVIDER, modelId: DEFAULT_MODEL_ID, thinkingLevel: 'minimal' },
  hypothesis: {},
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

/** Vertical shift (px) when forking hypothesis previews so new stack does not overlap pins. */
export const FORK_HYPOTHESIS_PREVIEW_STACK_OFFSET_PX = 200;

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
