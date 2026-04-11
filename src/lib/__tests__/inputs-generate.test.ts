import { describe, expect, it } from 'vitest';
import {
  buildInputsGenerateUserMessage,
  promptKeyForInputsGenerate,
} from '../prompts/inputs-generate.ts';

describe('inputs-generate helpers', () => {
  describe('promptKeyForInputsGenerate', () => {
    it('maps spec input ids to prompt defaults keys', () => {
      expect(promptKeyForInputsGenerate('research-context')).toBe('inputs-gen-research-context');
      expect(promptKeyForInputsGenerate('objectives-metrics')).toBe('inputs-gen-objectives-metrics');
      expect(promptKeyForInputsGenerate('design-constraints')).toBe('inputs-gen-design-constraints');
    });
  });

  describe('buildInputsGenerateUserMessage', () => {
    it('includes brief, target, and omits cross-facets that match target', () => {
      const msg = buildInputsGenerateUserMessage({
        targetInput: 'research-context',
        designBrief: '  Brief here  ',
        existingDesign: 'Existing',
        researchContext: 'Draft research',
        objectivesMetrics: 'Goals',
        designConstraints: 'Rules',
      });
      expect(msg).toContain('<target_input>research-context</target_input>');
      expect(msg).toContain('<design_brief>\nBrief here\n</design_brief>');
      expect(msg).toContain('<existing_design>\nExisting\n</existing_design>');
      expect(msg).toContain('<objectives_metrics>\nGoals\n</objectives_metrics>');
      expect(msg).toContain('<design_constraints>\nRules\n</design_constraints>');
      expect(msg).not.toContain('<research_context>');
      expect(msg).toContain('<current_input_draft>\nDraft research\n</current_input_draft>');
    });

    it('skips optional blocks when empty', () => {
      const msg = buildInputsGenerateUserMessage({
        targetInput: 'objectives-metrics',
        designBrief: 'B',
      });
      expect(msg).toContain('<target_input>objectives-metrics</target_input>');
      expect(msg).not.toContain('existing_design');
      expect(msg).not.toContain('research_context');
      expect(msg).not.toContain('design_constraints');
      expect(msg).not.toContain('current_input_draft');
    });

    it('for objectives-metrics, includes research_context when present but not objectives block', () => {
      const msg = buildInputsGenerateUserMessage({
        targetInput: 'objectives-metrics',
        designBrief: 'B',
        researchContext: 'RC',
      });
      expect(msg).toContain('<research_context>\nRC\n</research_context>');
      expect(msg).not.toContain('<objectives_metrics>');
    });
  });
});
