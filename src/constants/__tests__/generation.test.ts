import { describe, it, expect } from 'vitest';
import { GENERATION_MODE, type GenerationMode } from '../generation';

describe('GENERATION_MODE', () => {
  it('exports only agentic', () => {
    expect(GENERATION_MODE.AGENTIC).toBe('agentic');
  });

  it('GenerationMode is the agentic literal', () => {
    const mode: GenerationMode = GENERATION_MODE.AGENTIC;
    expect(mode).toBe('agentic');
  });
});
