/**
 * Session-type contract shared between the Pi runtime, task-agent plumbing,
 * SSE/log mappers, and the orchestrator. Intentionally host-owned (not in
 * `@auto-designer/pi`) so deleting Pi-internal modules never threatens the
 * type used by all the non-Pi consumers.
 *
 * The package's `SessionScopedResourceLoader` defines a structurally
 * identical type for its own use; this file is the host's source of truth.
 */
export type SessionType =
  | 'design'
  | 'incubation'
  | 'internal-context'
  | 'evaluation'
  | 'inputs-gen'
  | 'design-system';
