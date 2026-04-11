import type { AgenticPhase } from '../../src/types/evaluation.ts';
import type { RunTraceEvent } from '../../src/types/provider.ts';
import type { LoadedSkillSummary } from './skill-schema.ts';
import { makeRunTraceEvent } from './run-trace.ts';

/** Trace + `skills_loaded` pair emitted at the start of each Pi session round. */
export type SkillsLoadedStreamEvent =
  | { type: 'trace'; trace: RunTraceEvent }
  | { type: 'skills_loaded'; skills: LoadedSkillSummary[] };

/**
 * Emit the standard skills catalog trace row and `skills_loaded` SSE payload.
 * Used by the agentic orchestrator and task-agent SSE paths.
 */
export async function emitSkillsLoadedEvents(
  emit: (e: SkillsLoadedStreamEvent) => void | Promise<void>,
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
