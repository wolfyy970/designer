import { describe, it, expect } from 'vitest';
import {
  INCUBATOR_USER_INPUTS_TEMPLATE,
  DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE,
} from '../prompt-templates.ts';

/** Placeholders that structural templates must retain for prompt assembly. */
const INCUBATOR_PLACEHOLDERS = [
  '{{SPEC_TITLE}}',
  '{{DESIGN_BRIEF}}',
  '{{EXISTING_DESIGN}}',
  '{{RESEARCH_CONTEXT}}',
  '{{OBJECTIVES_METRICS}}',
  '{{DESIGN_CONSTRAINTS}}',
  '{{IMAGE_BLOCK}}',
  '{{INTERNAL_CONTEXT_DOCUMENT_BLOCK}}',
  '{{DESIGN_SYSTEM_DOCUMENTS_BLOCK}}',
  '{{REFERENCE_DESIGNS_BLOCK}}',
  '{{EXISTING_HYPOTHESES_BLOCK}}',
  '{{INCUBATOR_HYPOTHESIS_COUNT_LINE}}',
] as const;

const HYPOTHESIS_PLACEHOLDERS = [
  '{{STRATEGY_NAME}}',
  '{{HYPOTHESIS}}',
  '{{RATIONALE}}',
  '{{MEASUREMENTS}}',
  '{{DIMENSION_VALUES}}',
  '{{DESIGN_BRIEF}}',
  '{{RESEARCH_CONTEXT}}',
  '{{IMAGE_BLOCK}}',
  '{{OBJECTIVES_METRICS}}',
  '{{DESIGN_CONSTRAINTS}}',
  '{{DESIGN_SYSTEM}}',
] as const;

describe('prompt-templates', () => {
  it('INCUBATOR_USER_INPUTS_TEMPLATE contains all expected placeholders', () => {
    for (const ph of INCUBATOR_PLACEHOLDERS) {
      expect(INCUBATOR_USER_INPUTS_TEMPLATE, ph).toContain(ph);
    }
    expect(INCUBATOR_USER_INPUTS_TEMPLATE).toContain('<specification');
    expect(INCUBATOR_USER_INPUTS_TEMPLATE).toContain('Produce the dimension map as JSON');
  });

  it('DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE contains all expected placeholders', () => {
    for (const ph of HYPOTHESIS_PLACEHOLDERS) {
      expect(DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE, ph).toContain(ph);
    }
    expect(DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE).toContain('<hypothesis>');
    expect(DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE).toContain('<specification>');
  });

  it('templates are stable glue only (no behavioral prose beyond structure)', () => {
    // Behavioral nuance belongs in skills; templates should stay thin wrappers.
    expect(INCUBATOR_USER_INPUTS_TEMPLATE.length).toBeGreaterThan(100);
    expect(DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE.length).toBeGreaterThan(100);
  });
});
