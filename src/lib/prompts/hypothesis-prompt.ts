import type { DesignSpec } from '../../types/spec';
import type { HypothesisStrategy } from '../../types/compiler';
import { interpolate } from '../utils';
import { getSectionContent, collectImageLines } from './helpers';

export function buildHypothesisPrompt(
  spec: DesignSpec,
  strategy: HypothesisStrategy,
  hypothesisTemplate: string,
  designSystemOverride?: string,
): string {
  const imageDescriptions = collectImageLines(spec).join('\n');

  const dimensionValuesList = Object.entries(strategy.dimensionValues)
    .map(([dim, val]) => `- ${dim}: ${val}`)
    .join('\n');

  const imageBlock = imageDescriptions
    ? `### Existing Design Reference\n${getSectionContent(spec, 'existing-design')}\n\nReference images:\n${imageDescriptions}`
    : '';

  return interpolate(hypothesisTemplate, {
    STRATEGY_NAME: strategy.name,
    HYPOTHESIS: strategy.hypothesis,
    RATIONALE: strategy.rationale,
    MEASUREMENTS: strategy.measurements,
    DIMENSION_VALUES: dimensionValuesList || '(Use your judgment within the exploration space ranges)',
    DESIGN_BRIEF: getSectionContent(spec, 'design-brief'),
    RESEARCH_CONTEXT: getSectionContent(spec, 'research-context'),
    IMAGE_BLOCK: imageBlock,
    OBJECTIVES_METRICS: getSectionContent(spec, 'objectives-metrics'),
    DESIGN_CONSTRAINTS: getSectionContent(spec, 'design-constraints'),
    DESIGN_SYSTEM: designSystemOverride ?? getSectionContent(spec, 'design-system'),
  });
}
