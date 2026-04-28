import type { DesignSpec, ReferenceImage } from '../../src/types/spec.ts';
import type { CompiledPrompt, IncubationPlan, HypothesisStrategy } from '../../src/types/incubator.ts';
import { buildHypothesisPrompt } from '../../src/lib/prompts/hypothesis-prompt.ts';
import { generateId, now } from '../../src/lib/utils.ts';

export function incubateHypothesisPrompts(
  spec: DesignSpec,
  incubationPlan: IncubationPlan,
  hypothesisTemplate: string,
  designSystemOverride?: string,
  extraImages?: ReferenceImage[],
): CompiledPrompt[] {
  const allImages = [
    ...Object.values(spec.sections).flatMap((s) => s.images),
    ...(extraImages ?? []),
  ];

  return incubationPlan.hypotheses.map((strategy: HypothesisStrategy) => ({
    id: generateId(),
    strategyId: strategy.id,
    specId: spec.id,
    prompt: buildHypothesisPrompt(spec, strategy, hypothesisTemplate, designSystemOverride),
    images: allImages,
    compiledAt: now(),
  }));
}
