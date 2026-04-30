import type { PromptKey } from './defaults';

/** Spec input ids that support magic-wand auto-generate in InputNode. */
export type InputsGenerateTargetSpecId =
  | 'research-context'
  | 'objectives-metrics'
  | 'design-constraints';

export function promptKeyForInputsGenerate(target: InputsGenerateTargetSpecId): PromptKey {
  switch (target) {
    case 'research-context':
      return 'inputs-gen-research-context';
    case 'objectives-metrics':
      return 'inputs-gen-objectives-metrics';
    case 'design-constraints':
      return 'inputs-gen-design-constraints';
  }
}

export interface InputsGenerateUserMessageInput {
  targetInput: InputsGenerateTargetSpecId;
  designBrief: string;
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
 * Assembles the user message for POST /api/inputs/generate.
 */
export function buildInputsGenerateUserMessage(input: InputsGenerateUserMessageInput): string {
  const lines: string[] = [
    'Using the following inputs, produce the body text for <target_input> only, following your system rules.',
    `<target_input>${input.targetInput}</target_input>`,
    `<design_brief>\n${input.designBrief.trim()}\n</design_brief>`,
  ];

  if (input.targetInput !== 'research-context') {
    appendBlock(lines, 'research_context', input.researchContext);
  }
  if (input.targetInput !== 'objectives-metrics') {
    appendBlock(lines, 'objectives_metrics', input.objectivesMetrics);
  }
  if (input.targetInput !== 'design-constraints') {
    appendBlock(lines, 'design_constraints', input.designConstraints);
  }

  const targetDraft =
    input.targetInput === 'research-context'
      ? input.researchContext
      : input.targetInput === 'objectives-metrics'
        ? input.objectivesMetrics
        : input.designConstraints;
  appendBlock(lines, 'current_input_draft', targetDraft);

  return lines.join('\n\n');
}
