import { buildIncubateInputs } from '../lib/canvas-graph';
import { findStrategy } from '../stores/incubator-store';
import type { DesignSpec } from '../types/spec';
import type { IncubationPlan, HypothesisStrategy } from '../types/incubator';
import type { GenerationResult } from '../types/provider';
import type { DomainHypothesis, DomainIncubatorWiring } from '../types/workspace-domain';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';

export interface IncubatorRunSnapshot {
  incubatorId: string;
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  spec: DesignSpec;
  results: GenerationResult[];
  wiring: DomainIncubatorWiring | undefined;
  incubationPlans: Record<string, IncubationPlan>;
  hypotheses: Record<string, DomainHypothesis>;
}

export function collectExistingIncubatorStrategies(
  snapshot: Pick<IncubatorRunSnapshot, 'incubatorId' | 'incubationPlans' | 'hypotheses'>,
): HypothesisStrategy[] {
  const existingStrategies: HypothesisStrategy[] = [];
  for (const hypothesis of Object.values(snapshot.hypotheses)) {
    if (hypothesis.incubatorId !== snapshot.incubatorId || hypothesis.placeholder) continue;
    const strategy = findStrategy(snapshot.incubationPlans, hypothesis.strategyId);
    if (strategy) existingStrategies.push(strategy);
  }
  return existingStrategies;
}

export async function buildIncubatorRunInputs(input: {
  snapshot: IncubatorRunSnapshot;
  hypothesisCount: number;
  internalContextDocument: string;
  designSystemDocuments: { nodeId: string; title: string; content: string }[];
}): Promise<{
  spec: DesignSpec;
  referenceDesigns: { name: string; code: string }[];
  internalContextDocument: string;
  designSystemDocuments: { nodeId: string; title: string; content: string }[];
  promptOptions: {
    count: number;
    existingStrategies: HypothesisStrategy[];
  };
}> {
  const { partialSpec, referenceDesigns } = await buildIncubateInputs(
    input.snapshot.nodes,
    input.snapshot.edges,
    input.snapshot.spec,
    input.snapshot.incubatorId,
    input.snapshot.results,
    input.snapshot.wiring,
  );

  return {
    spec: partialSpec,
    referenceDesigns,
    internalContextDocument: input.internalContextDocument,
    designSystemDocuments: input.designSystemDocuments,
    promptOptions: {
      count: input.hypothesisCount,
      existingStrategies: collectExistingIncubatorStrategies(input.snapshot),
    },
  };
}
