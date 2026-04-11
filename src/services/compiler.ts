import type { DesignSpec, ReferenceImage } from '../types/spec';
import type { CompiledPrompt, IncubationPlan, HypothesisStrategy } from '../types/incubator';
import { buildHypothesisPrompt } from '../lib/prompts/hypothesis-prompt';
import { generateId, now } from '../lib/utils';

/** Assemble compiled prompts for each hypothesis strategy in the incubation plan. */
export function compileVariantPrompts(
  spec: DesignSpec,
  incubationPlan: IncubationPlan,
  variantTemplate: string,
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
    prompt: buildHypothesisPrompt(spec, strategy, variantTemplate, designSystemOverride),
    images: allImages,
    compiledAt: now(),
  }));
}
