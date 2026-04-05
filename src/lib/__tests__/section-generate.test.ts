import { describe, expect, it } from 'vitest';
import {
  buildSectionGenerateUserMessage,
  promptKeyForSectionGenerate,
} from '../prompts/section-generate.ts';

describe('section-generate helpers', () => {
  describe('promptKeyForSectionGenerate', () => {
    it('maps section ids to Langfuse / defaults keys', () => {
      expect(promptKeyForSectionGenerate('research-context')).toBe('section-gen-research-context');
      expect(promptKeyForSectionGenerate('objectives-metrics')).toBe('section-gen-objectives-metrics');
      expect(promptKeyForSectionGenerate('design-constraints')).toBe('section-gen-design-constraints');
    });
  });

  describe('buildSectionGenerateUserMessage', () => {
    it('includes brief, target, and omits cross-sections that match target', () => {
      const msg = buildSectionGenerateUserMessage({
        targetSection: 'research-context',
        designBrief: '  Brief here  ',
        existingDesign: 'Existing',
        researchContext: 'Draft research',
        objectivesMetrics: 'Goals',
        designConstraints: 'Rules',
      });
      expect(msg).toContain('<target_section>research-context</target_section>');
      expect(msg).toContain('<design_brief>\nBrief here\n</design_brief>');
      expect(msg).toContain('<existing_design>\nExisting\n</existing_design>');
      expect(msg).toContain('<objectives_metrics>\nGoals\n</objectives_metrics>');
      expect(msg).toContain('<design_constraints>\nRules\n</design_constraints>');
      expect(msg).not.toContain('<research_context>');
      expect(msg).toContain('<current_section_draft>\nDraft research\n</current_section_draft>');
    });

    it('skips optional blocks when empty', () => {
      const msg = buildSectionGenerateUserMessage({
        targetSection: 'objectives-metrics',
        designBrief: 'B',
      });
      expect(msg).toContain('<target_section>objectives-metrics</target_section>');
      expect(msg).not.toContain('existing_design');
      expect(msg).not.toContain('research_context');
      expect(msg).not.toContain('design_constraints');
      expect(msg).not.toContain('current_section_draft');
    });

    it('for objectives-metrics, includes research_context when present but not objectives block', () => {
      const msg = buildSectionGenerateUserMessage({
        targetSection: 'objectives-metrics',
        designBrief: 'B',
        researchContext: 'RC',
      });
      expect(msg).toContain('<research_context>\nRC\n</research_context>');
      expect(msg).not.toContain('<objectives_metrics>');
    });
  });
});
