import type { AgenticPhase } from '../types/evaluation';

/** Canonical `AgenticPhase` strings on the generate SSE wire. */
export const AGENTIC_PHASE: {
  readonly BUILDING: AgenticPhase;
  readonly EVALUATING: AgenticPhase;
  readonly REVISING: AgenticPhase;
  readonly COMPLETE: AgenticPhase;
} = {
  BUILDING: 'building',
  EVALUATING: 'evaluating',
  REVISING: 'revising',
  COMPLETE: 'complete',
};
