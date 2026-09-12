/**
 * Pins the completion-budget relationship that is currently **inert by
 * accident**, so a decision to change it has to be deliberate.
 *
 * `config/completion-budget.json` reads like the oracle, and
 * `server/lib/completion-budget.ts` parses it — but `host.ts` calls
 * `buildModel()` without a `budgetConfig`, so `model.maxTokens` comes from
 * `DEFAULT_COMPLETION_BUDGET` in the Pi package, and
 * `server/lib/pi-stream-budget.ts` clamps every turn to it:
 *
 *     const ceil = Math.min(model.maxTokens, product ?? model.maxTokens);
 *
 * The two tables disagree on every value:
 *
 *     field              config/    package
 *     minCompletion         256        1024
 *     absoluteCeiling   2097152       32768
 *     incubate margin      1536        8192
 *     compaction margin    2048        8192
 *     agentTurn margin     6144       16384
 *     default margin       4096        8192
 *
 * Consequence, measured: the hard ceiling is 32 768 no matter the context
 * window, and raising `absoluteCeiling` in the config does nothing. The
 * *per-turn* figure still tracks the config, so this is not unbounded — but the
 * two tables cannot both be authoritative.
 *
 * These tests assert the CURRENT behaviour. They exist so that making the host
 * table win becomes a visible, intentional edit rather than a silent drift, and
 * so the false "defaults are aligned with the host's config" comment that used to
 * sit in the package cannot come back unnoticed.
 */
import { describe, expect, it } from 'vitest';

import hostConfig from '../../../config/completion-budget.json';
import {
  DEFAULT_COMPLETION_BUDGET,
  maxCompletionBudgetForContextWindow,
} from '../src/internal/completion-budget';

describe('completion budget: host config vs package default', () => {
  it('documents that the host config does NOT reach the package table', () => {
    // If someone aligns them, this assertion is the first thing that fails —
    // which is the point. Update it deliberately, not incidentally.
    expect(DEFAULT_COMPLETION_BUDGET.minCompletion).not.toBe(hostConfig.minCompletion);
    expect(DEFAULT_COMPLETION_BUDGET.absoluteCeiling).not.toBe(hostConfig.absoluteCeiling);
    expect(DEFAULT_COMPLETION_BUDGET.margins.incubate).not.toBe(hostConfig.margins.incubate);
    expect(DEFAULT_COMPLETION_BUDGET.margins.agent_turn).not.toBe(hostConfig.margins.agentTurn);
  });

  it('caps at the package ceiling for every context window at or above it', () => {
    // The load-bearing consequence: a 1M-token model still gets 32 768, because
    // the `default` margin is subtracted first and the package ceiling then binds.
    const packageCeiling = DEFAULT_COMPLETION_BUDGET.absoluteCeiling;
    const margin = DEFAULT_COMPLETION_BUDGET.margins.default;
    for (const cw of [131_072, 1_048_576]) {
      expect(maxCompletionBudgetForContextWindow(cw, undefined, DEFAULT_COMPLETION_BUDGET)).toBe(
        Math.min(cw - margin, packageCeiling),
      );
    }
    // a window smaller than the ceiling keeps its full budget minus the margin
    expect(maxCompletionBudgetForContextWindow(32_768, undefined, DEFAULT_COMPLETION_BUDGET)).toBe(
      32_768 - margin,
    );
    expect(packageCeiling).toBeLessThan(hostConfig.absoluteCeiling);
  });

  it('honours a product cap when one is supplied', () => {
    // MAX_OUTPUT_TOKENS, when set, is the outer bound on both paths.
    expect(
      maxCompletionBudgetForContextWindow(1_048_576, 4_096, DEFAULT_COMPLETION_BUDGET),
    ).toBe(4_096);
  });

  it('falls back to a 4096 floor when the window cannot cover the margin', () => {
    // Below the margin the budget goes negative, so the session-ceiling fallback
    // applies. Pinned because it is the one path where the configured floor is
    // NOT what the caller receives.
    for (const cw of [1, 4096]) {
      expect(maxCompletionBudgetForContextWindow(cw, undefined, DEFAULT_COMPLETION_BUDGET)).toBe(4096);
    }
  });
});
