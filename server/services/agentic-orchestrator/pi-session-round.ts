import { buildAgenticSystemContext } from '../../lib/build-agentic-system-context.ts';
import { emitSkillsLoadedEvents } from '../../lib/agentic-skills-emission.ts';
import type { AgenticPhase } from '../../../src/types/evaluation.ts';
import { runDesignAgentSession } from '../pi-agent-service.ts';
import type { AgentRunEvent, DesignAgentSessionResult } from '../pi-agent-run-types.ts';
import type { AgenticOrchestratorOptions } from './types.ts';
import { emitOrchestratorEvent, type StreamEmissionContext } from './emit.ts';

type PiSessionExtras = Partial<
  Pick<
    import('../pi-agent-run-types.ts').AgentSessionParams,
    'userPrompt' | 'seedFiles' | 'compactionNote' | 'initialProgressMessage'
  >
>;

type AgenticSystemContextBundle = Awaited<ReturnType<typeof buildAgenticSystemContext>>;

/** Refresh agentic context, emit skills_loaded, run one Pi design session. */
export async function runAgenticPiSessionRound(
  options: AgenticOrchestratorOptions,
  streamCtx: StreamEmissionContext,
  forward: (e: AgentRunEvent) => Promise<void>,
  tracePhase: AgenticPhase,
  setPiTracePhase: (p: AgenticPhase) => void,
  sessionExtras:
    | PiSessionExtras
    | ((ctx: AgenticSystemContextBundle) => PiSessionExtras),
): Promise<DesignAgentSessionResult | null> {
  const ctx = await buildAgenticSystemContext({ sessionType: options.sessionType });
  await emitSkillsLoadedEvents((e) => emitOrchestratorEvent(streamCtx, e), ctx.loadedSkills, tracePhase);
  setPiTracePhase(tracePhase);
  const extras = typeof sessionExtras === 'function' ? sessionExtras(ctx) : sessionExtras;
  return runDesignAgentSession(
    {
      ...options.build,
      ...extras,
      sessionType: options.sessionType ?? 'design',
      systemPrompt: ctx.systemPrompt,
      skillCatalog: ctx.skillCatalog,
    },
    forward,
  );
}
