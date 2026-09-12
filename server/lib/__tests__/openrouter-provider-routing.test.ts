import { describe, expect, it } from 'vitest';
import rawRoutingConfig from '../../../config/openrouter-routing.json';
import rawTaskDefaults from '../../../config/task-defaults.json';
import { THINKING_TASKS } from '../../../src/lib/thinking-defaults';
import {
  OpenRouterRoutingConfigSchema,
  openRouterProviderRoutingForModel,
} from '../openrouter-provider-routing';

describe('openRouterProviderRoutingForModel', () => {
  it('round-trips config/openrouter-routing.json through the schema', () => {
    expect(OpenRouterRoutingConfigSchema.safeParse(rawRoutingConfig).success).toBe(true);
  });

  it('returns no routing override for a model with no entry', () => {
    // The mechanism's contract: an unknown model means "let OpenRouter decide",
    // not "fail" and not "apply someone else's pin".
    expect(openRouterProviderRoutingForModel('deepseek/deepseek-v4.1-flash')).toEqual({});
    expect(openRouterProviderRoutingForModel('some/other-model')).toEqual({});
  });

  it('emits a provider block for a configured model', () => {
    // Exercised against whatever the shipped config contains, so this keeps
    // testing the mapping even while the config is empty.
    const entry = Object.keys(rawRoutingConfig.modelProviderRouting)[0];
    if (!entry) {
      expect(openRouterProviderRoutingForModel('anything')).toEqual({});
      return;
    }
    const routed = openRouterProviderRoutingForModel(entry);
    expect(routed.provider?.order.length).toBeGreaterThan(0);
    expect(typeof routed.provider?.allow_fallbacks).toBe('boolean');
  });

  it('carries no routing entry for a model nothing selects any more', () => {
    /**
     * Regression guard for a stale-config trap. `minimax/minimax-m2.5` kept a
     * `{ order: ['mara'], allow_fallbacks: false }` pin long after the default
     * moved to `deepseek/deepseek-v4.1-flash`. Nothing consumed it, but it made
     * the repo read as though it were still configured for MiniMax — which is
     * how it looked while debugging the model label on the preview card.
     *
     * A routing entry should exist only for a model something actually selects.
     */
    const configured = Object.keys(rawRoutingConfig.modelProviderRouting);
    const defaults: string[] = THINKING_TASKS.map(
      (task) => rawTaskDefaults.perTaskDefaults[task]?.modelId,
    );
    const stale = configured.filter((modelId) => !defaults.includes(modelId));
    expect(stale, `stale routing entries: ${stale.join(', ')}`).toEqual([]);
  });
});
