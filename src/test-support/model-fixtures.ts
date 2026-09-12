/**
 * Canonical model identifiers for tests.
 *
 * Model ids were previously copy-pasted as string literals across nine test
 * files and nine experiment scripts — 21 copies of `minimax/minimax-m2.5` alone.
 * That is a DRY failure with a real cost: nothing told you which of those copies
 * were load-bearing, and a stale literal kept making the repo *read* as though
 * it were still configured for a model nothing selected any more.
 *
 * The production path never had this problem — `src/lib/task-defaults.ts` reads
 * `config/task-defaults.json` through a Zod schema. Tests should do the same,
 * and derive the id rather than restate it.
 */

import rawTaskDefaults from '../../config/task-defaults.json';
import type { ThinkingTask } from '../lib/thinking-defaults';

/**
 * The model a task uses when the user has set no override.
 *
 * Prefer this over a literal when a test needs "whatever the shipped default
 * is". A test that hardcodes the current default has to be edited on every
 * model change even when its subject has nothing to do with model choice.
 */
export function defaultModelIdFor(task: ThinkingTask = 'design'): string {
  return rawTaskDefaults.perTaskDefaults[task].modelId;
}

/** The provider paired with {@link defaultModelIdFor}. */
export function defaultProviderIdFor(task: ThinkingTask = 'design'): string {
  return rawTaskDefaults.perTaskDefaults[task].providerId;
}

/** Shorthand for the design task — by far the most common in tests. */
export const DEFAULT_MODEL_ID = defaultModelIdFor('design');

/**
 * A model that is deliberately NOT the default, for tests that need to prove
 * something is *not* being used. Nothing depends on which model this is.
 */
export const NON_DEFAULT_MODEL_ID = 'example-provider/not-the-default';

/** A reasoning-capable model id, for capability-gate tests. */
export const REASONING_MODEL_ID = 'minimax/minimax-m2.7';

/**
 * A non-reasoning model id, for capability-gate tests.
 *
 * Deliberately an older MiniMax: the assertion is about the *capability gate*,
 * not about this app's defaults, so it must not track `config/task-defaults.json`.
 * Using the live default here would make the test vacuous the moment the
 * default changes to something else.
 */
export const NON_REASONING_MODEL_ID = 'minimax/minimax-m2.5';
