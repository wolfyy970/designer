import { buildAgenticSystemContext } from '../../lib/build-agentic-system-context.ts';
import { emitSkillsLoadedEvents } from '../../lib/agentic-skills-emission.ts';
import type { AgenticPhase } from '../../../src/types/evaluation.ts';
import { runDesignAgentSession } from '../agent-runtime.ts';
import type { AgentRunEvent, DesignAgentSessionResult } from '../agent-runtime.ts';
import type { AgenticOrchestratorOptions } from './types.ts';
import { emitOrchestratorEvent, type StreamEmissionContext } from './emit.ts';

type PiSessionExtras = Partial<
  Pick<
    import('../agent-runtime.ts').AgentSessionParams,
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
