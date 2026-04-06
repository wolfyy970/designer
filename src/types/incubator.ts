import type { ReferenceImage } from './spec';

export interface HypothesisStrategy {
  id: string;
  name: string;
  hypothesis: string;
  rationale: string;
  measurements: string;
  dimensionValues: Record<string, string>;
}

interface Dimension {
  name: string;
  range: string;
  isConstant: boolean;
}

export interface IncubationPlan {
  id: string;
  specId: string;
  dimensions: Dimension[];
  hypotheses: HypothesisStrategy[];
  generatedAt: string;
  approvedAt?: string;
  /** Model id used when this plan was produced. */
  incubatorModel: string;
}

export interface CompiledPrompt {
  id: string;
  strategyId: string;
  specId: string;
  prompt: string;
  images: ReferenceImage[];
  compiledAt: string;
}
