/**
 * Shared SSE emission helpers for agentic orchestration (design pipeline + task-agent routes).
 */
import type { AgenticPhase } from '../../src/types/evaluation.ts';
import { makeRunTraceEvent } from './run-trace.ts';
import type { LoadedSkillSummary } from './skill-schema.ts';
import type { AgenticOrchestratorEvent } from '../services/agentic-orchestrator.ts';

/** Emits `skills_loaded` trace + `skills_loaded` event (same sequence as Pi session start). */
export async function emitSkillsLoadedOrchestratorEvents(
  emit: (e: AgenticOrchestratorEvent) => Promise<void>,
  skills: LoadedSkillSummary[],
  tracePhase: AgenticPhase,
): Promise<void> {
  const label =
    skills.length === 0
      ? 'No agent skills in catalog for this session'
      : `Skills catalog (${skills.length}): ${skills.map((s) => s.name).join(', ')}`;
  await emit({
    type: 'trace',
    trace: makeRunTraceEvent({
      kind: 'skills_loaded',
      label,
      phase: tracePhase,
      status: skills.length === 0 ? 'info' : 'success',
    }),
  });
  await emit({ type: 'skills_loaded', skills });
}
