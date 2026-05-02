import { describe, it, expect } from 'vitest';
import * as pi from '../src/index';

/**
 * Phase 1 wiring proof: the package exports its public API surface and every
 * factory throws NotImplementedError until Phase 2 lands the real layer.
 *
 * When Phase 2 starts replacing factories, expect these "throws not-implemented"
 * tests to fail — that's the signal to retire each one in favor of a real
 * integration test against the implemented factory.
 */

describe('@auto-designer/pi public API', () => {
  it('exports every session factory', () => {
    expect(typeof pi.createDesignSession).toBe('function');
    expect(typeof pi.createEvaluationSession).toBe('function');
    expect(typeof pi.createIncubationSession).toBe('function');
    expect(typeof pi.createInputsGenSession).toBe('function');
    expect(typeof pi.createDesignSystemSession).toBe('function');
    expect(typeof pi.createInternalContextSession).toBe('function');
  });

  it('every factory throws NotImplementedError until Phase 2 wires it', () => {
    const baseOpts = {
      providerId: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      systemPrompt: '',
      userPrompt: '',
    } as const;
    expect(() => pi.createDesignSession({ ...baseOpts })).toThrow(pi.NotImplementedError);
    expect(() => pi.createEvaluationSession({ ...baseOpts })).toThrow(pi.NotImplementedError);
    expect(() => pi.createIncubationSession({ ...baseOpts })).toThrow(pi.NotImplementedError);
    expect(() => pi.createInputsGenSession({ ...baseOpts })).toThrow(pi.NotImplementedError);
    expect(() => pi.createDesignSystemSession({ ...baseOpts })).toThrow(pi.NotImplementedError);
    expect(() => pi.createInternalContextSession({ ...baseOpts })).toThrow(pi.NotImplementedError);
  });
});
