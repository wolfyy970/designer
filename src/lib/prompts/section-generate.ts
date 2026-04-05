import type { PromptKey } from './defaults';

/** Spec section ids that support magic-wand auto-generate in SectionNode. */
export type SectionGenerateTargetSpecId =
  | 'research-context'
  | 'objectives-metrics'
  | 'design-constraints';

export function promptKeyForSectionGenerate(target: SectionGenerateTargetSpecId): PromptKey {
  switch (target) {
    case 'research-context':
      return 'section-gen-research-context';
    case 'objectives-metrics':
      return 'section-gen-objectives-metrics';
    case 'design-constraints':
      return 'section-gen-design-constraints';
  }
}

export interface SectionGenerateUserMessageInput {
  targetSection: SectionGenerateTargetSpecId;
  designBrief: string;
  existingDesign?: string;
  researchContext?: string;
  objectivesMetrics?: string;
  designConstraints?: string;
}

function appendBlock(lines: string[], tag: string, body: string | undefined): void {
  const t = body?.trim();
  if (!t) return;
  lines.push(`<${tag}>\n${t}\n</${tag}>`);
}

/**
 * Assembles the user message for POST /api/section/generate.
 * Includes the brief, other non-empty spec sections as cross-reference (not the section being generated),
 * and optional draft of the target section for refine/regenerate.
 */
export function buildSectionGenerateUserMessage(input: SectionGenerateUserMessageInput): string {
  const lines: string[] = [
    'Using the following inputs, produce the body text for <target_section> only, following your system rules.',
    `<target_section>${input.targetSection}</target_section>`,
    `<design_brief>\n${input.designBrief.trim()}\n</design_brief>`,
  ];

  appendBlock(lines, 'existing_design', input.existingDesign);
  if (input.targetSection !== 'research-context') {
    appendBlock(lines, 'research_context', input.researchContext);
  }
  if (input.targetSection !== 'objectives-metrics') {
    appendBlock(lines, 'objectives_metrics', input.objectivesMetrics);
  }
  if (input.targetSection !== 'design-constraints') {
    appendBlock(lines, 'design_constraints', input.designConstraints);
  }

  const targetDraft =
    input.targetSection === 'research-context'
      ? input.researchContext
      : input.targetSection === 'objectives-metrics'
        ? input.objectivesMetrics
        : input.designConstraints;
  appendBlock(lines, 'current_section_draft', targetDraft);

  return lines.join('\n\n');
}
