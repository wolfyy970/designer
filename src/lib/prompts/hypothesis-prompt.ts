import type { DesignSpec } from '../../types/spec';
import type { HypothesisStrategy } from '../../types/incubator';
import { interpolate } from '../utils';
import { getSectionContent } from './helpers';

export function buildHypothesisPrompt(
  spec: DesignSpec,
  strategy: HypothesisStrategy,
  hypothesisTemplate: string,
  designSystemOverride?: string,
): string {
  const dimensionValuesList = Object.entries(strategy.dimensionValues)
    .map(([dim, val]) => `- ${dim}: ${val}`)
    .join('\n');

  return interpolate(hypothesisTemplate, {
    STRATEGY_NAME: strategy.name,
    HYPOTHESIS: strategy.hypothesis,
    RATIONALE: strategy.rationale,
    MEASUREMENTS: strategy.measurements,
    DIMENSION_VALUES: dimensionValuesList || '(Use your judgment within the exploration space ranges)',
    DESIGN_BRIEF: getSectionContent(spec, 'design-brief'),
    RESEARCH_CONTEXT: getSectionContent(spec, 'research-context'),
    IMAGE_BLOCK: '',
    OBJECTIVES_METRICS: getSectionContent(spec, 'objectives-metrics'),
    DESIGN_CONSTRAINTS: getSectionContent(spec, 'design-constraints'),
    DESIGN_SYSTEM: designSystemOverride ?? getSectionContent(spec, 'design-system'),
  });
}
