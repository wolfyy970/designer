import type { ThinkingConfig } from '../../src/lib/thinking-defaults.ts';
import { emitSkillsLoadedEvents, type SkillsLoadedStreamEvent } from '../lib/agentic-skills-emission.ts';
import { buildAgenticSystemContext } from '../lib/build-agentic-system-context.ts';
import type { SessionType } from '../lib/skill-discovery.ts';
import { runDesignAgentSession, type AgentRunEvent } from './agent-runtime.ts';

export interface TaskAgentPiSessionInput {
  userPrompt: string;
  providerId: string;
  modelId: string;
  sessionType: SessionType;
  thinking?: ThinkingConfig;
  signal?: AbortSignal;
  correlationId: string;
  initialProgressMessage?: string;
}

export type TaskAgentPiSessionResult = Awaited<ReturnType<typeof runDesignAgentSession>>;
export type TaskAgentStreamEvent = AgentRunEvent | SkillsLoadedStreamEvent;

export interface TaskAgentPiSessionOutput {
  sessionResult: TaskAgentPiSessionResult;
  skillKeys: string[];
}

export async function runTaskAgentPiSession(
  input: TaskAgentPiSessionInput,
  forward: (event: TaskAgentStreamEvent) => Promise<void>,
): Promise<TaskAgentPiSessionOutput> {
  const ctx = await buildAgenticSystemContext({ sessionType: input.sessionType });
  await emitSkillsLoadedEvents(forward, ctx.loadedSkills, 'building');

  const sessionResult = await runDesignAgentSession(
    {
      userPrompt: input.userPrompt,
      providerId: input.providerId,
      modelId: input.modelId,
      thinkingLevel: input.thinking?.level,
      signal: input.signal,
      correlationId: input.correlationId,
      sessionType: input.sessionType,
      systemPrompt: ctx.systemPrompt,
      skillCatalog: ctx.skillCatalog,
      seedFiles: ctx.sandboxSeedFiles,
      initialProgressMessage:
        input.initialProgressMessage ?? 'Starting task…',
    },
    (event) => forward(event),
  );

  return {
    sessionResult,
    skillKeys: ctx.loadedSkills.map((skill) => skill.key),
  };
}
