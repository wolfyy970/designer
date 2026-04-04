/**
 * Maps agentic orchestrator / Pi stream events to SSE wire shape (event name + JSON body fields).
 */
import type { AgenticOrchestratorEvent } from '../services/agentic-orchestrator.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';

export function agenticOrchestratorEventToSse(
  event: AgenticOrchestratorEvent,
): { sseEvent: string; data: Record<string, unknown> } {
  switch (event.type) {
    case 'phase':
      return { sseEvent: SSE_EVENT_NAMES.phase, data: { phase: event.phase } };
    case 'evaluation_progress':
      return {
        sseEvent: SSE_EVENT_NAMES.evaluation_progress,
        data: {
          round: event.round,
          phase: event.phase,
          message: event.message,
        },
      };
    case 'evaluation_worker_done':
      return {
        sseEvent: SSE_EVENT_NAMES.evaluation_worker_done,
        data: { round: event.round, rubric: event.rubric, report: event.report },
      };
    case 'evaluation_report':
      return {
        sseEvent: SSE_EVENT_NAMES.evaluation_report,
        data: { round: event.round, snapshot: event.snapshot },
      };
    case 'revision_round':
      return {
        sseEvent: SSE_EVENT_NAMES.revision_round,
        data: { round: event.round, brief: event.brief },
      };
    case 'streaming_tool':
      return {
        sseEvent: SSE_EVENT_NAMES.streaming_tool,
        data: {
          toolName: event.toolName,
          streamedChars: event.streamedChars,
          done: event.done,
          ...(event.toolPath != null ? { toolPath: event.toolPath } : {}),
        },
      };
    case 'skills_loaded':
      return { sseEvent: SSE_EVENT_NAMES.skills_loaded, data: { skills: event.skills } };
    case 'skill_activated':
      return {
        sseEvent: SSE_EVENT_NAMES.skill_activated,
        data: { key: event.key, name: event.name, description: event.description },
      };
    case 'trace':
      return { sseEvent: SSE_EVENT_NAMES.trace, data: { trace: event.trace } };
    case 'thinking':
      return {
        sseEvent: SSE_EVENT_NAMES.thinking,
        data: { delta: event.payload, turnId: event.turnId },
      };
    case 'activity':
      return { sseEvent: SSE_EVENT_NAMES.activity, data: { entry: event.payload } };
    case 'code':
      return { sseEvent: SSE_EVENT_NAMES.code, data: { code: event.payload } };
    case 'error':
      return { sseEvent: SSE_EVENT_NAMES.error, data: { error: event.payload } };
    case 'file':
      return { sseEvent: SSE_EVENT_NAMES.file, data: { path: event.path, content: event.content } };
    case 'plan':
      return { sseEvent: SSE_EVENT_NAMES.plan, data: { files: event.files } };
    case 'todos':
      return { sseEvent: SSE_EVENT_NAMES.todos, data: { todos: event.todos } };
    case 'progress':
      return { sseEvent: SSE_EVENT_NAMES.progress, data: { status: event.payload } };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
