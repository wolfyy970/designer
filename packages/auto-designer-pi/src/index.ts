/**
 * Public API for the auto-designer Pi boundary.
 *
 * Phase 1 (skeleton): types and factory signatures only — every factory throws
 * `NotImplementedError` so consumers fail loudly until Phase 2 lands the real
 * integration layer. The legacy path under server/services/pi-* still serves
 * every session today.
 */

export const NOT_IMPLEMENTED = 'auto-designer-pi: factory not implemented yet (Phase 2)';

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method}: ${NOT_IMPLEMENTED}`);
    this.name = 'NotImplementedError';
  }
}

/** Discriminator for the session-scoped resource-loader filter and prompt-template selection. */
export type SessionType =
  | 'design'
  | 'evaluation'
  | 'incubation'
  | 'inputs-gen'
  | 'design-system'
  | 'internal-context';

/** Minimal shape every session factory needs. Concrete options refine this per session type. */
export interface BaseSessionOptions {
  providerId: string;
  modelId: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  cwd?: string;
  signal?: AbortSignal;
  /** Stable correlation id surfaced through events for log/SSE join. */
  correlationId?: string;
}

export interface DesignSessionOptions extends BaseSessionOptions {
  systemPrompt: string;
  userPrompt: string;
  seedFiles?: Record<string, string>;
}

export interface EvaluationSessionOptions extends BaseSessionOptions {
  systemPrompt: string;
  userPrompt: string;
}

export interface IncubationSessionOptions extends BaseSessionOptions {
  systemPrompt: string;
  userPrompt: string;
}

export interface InputsGenSessionOptions extends BaseSessionOptions {
  systemPrompt: string;
  userPrompt: string;
}

export interface DesignSystemSessionOptions extends BaseSessionOptions {
  systemPrompt: string;
  userPrompt: string;
}

export interface InternalContextSessionOptions extends BaseSessionOptions {
  systemPrompt: string;
  userPrompt: string;
}

/** Session lifecycle handle returned by every factory. Concrete event union arrives in Phase 2. */
export interface SessionHandle<TEvent = unknown, TResult = unknown> {
  readonly sessionId: string;
  subscribe(listener: (event: TEvent) => void | Promise<void>): () => void;
  run(): Promise<TResult>;
  abort(): Promise<void>;
}

export function createDesignSession(_opts: DesignSessionOptions): Promise<SessionHandle> {
  throw new NotImplementedError('createDesignSession');
}

export function createEvaluationSession(_opts: EvaluationSessionOptions): Promise<SessionHandle> {
  throw new NotImplementedError('createEvaluationSession');
}

export function createIncubationSession(_opts: IncubationSessionOptions): Promise<SessionHandle> {
  throw new NotImplementedError('createIncubationSession');
}

export function createInputsGenSession(_opts: InputsGenSessionOptions): Promise<SessionHandle> {
  throw new NotImplementedError('createInputsGenSession');
}

export function createDesignSystemSession(_opts: DesignSystemSessionOptions): Promise<SessionHandle> {
  throw new NotImplementedError('createDesignSystemSession');
}

export function createInternalContextSession(
  _opts: InternalContextSessionOptions,
): Promise<SessionHandle> {
  throw new NotImplementedError('createInternalContextSession');
}
