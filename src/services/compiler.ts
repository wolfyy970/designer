import type { DesignSpec, ReferenceImage } from '../types/spec';
import type { CompiledPrompt, DimensionMap, VariantStrategy } from '../types/compiler';
import { buildVariantPrompt } from '../lib/prompts/variant-prompt';
import { generateId, now } from '../lib/utils';

/** Assemble compiled prompts for each variant strategy in the dimension map. */
export function compileVariantPrompts(
  spec: DesignSpec,
  dimensionMap: DimensionMap,
  variantTemplate: string,
  designSystemOverride?: string,
  extraImages?: ReferenceImage[],
): CompiledPrompt[] {
  const allImages = [
    ...Object.values(spec.sections).flatMap((s) => s.images),
    ...(extraImages ?? []),
  ];

  return dimensionMap.variants.map((strategy: VariantStrategy) => ({
    id: generateId(),
    variantStrategyId: strategy.id,
    specId: spec.id,
    prompt: buildVariantPrompt(spec, strategy, variantTemplate, designSystemOverride),
    images: allImages,
    compiledAt: now(),
  }));
}
