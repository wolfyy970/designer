import { z } from 'zod';
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

/** Wire tuple for Zod / SSE — values derived from {@link AGENTIC_PHASE} (single source). */
export const AGENTIC_PHASE_WIRE_VALUES = [
  AGENTIC_PHASE.BUILDING,
  AGENTIC_PHASE.EVALUATING,
  AGENTIC_PHASE.REVISING,
  AGENTIC_PHASE.COMPLETE,
] as const;

export const agenticPhaseZodSchema = z.enum(AGENTIC_PHASE_WIRE_VALUES);
