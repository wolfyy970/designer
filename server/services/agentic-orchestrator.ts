/**
 * Agentic design build + parallel evaluators + bounded multi-round revision loop.
 * Implementation: `./agentic-orchestrator/` (stable import path: this file).
 */
export type {
  AgenticOrchestratorBuildInput,
  AgenticOrchestratorEvent,
  AgenticOrchestratorOptions,
  AgenticOrchestratorResult,
} from './agentic-orchestrator/index.ts';
export { runAgenticWithEvaluation } from './agentic-orchestrator/index.ts';
