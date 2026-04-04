import { describe, it, expect } from 'vitest';
import {
  TRANSIENT_RESULT_FIELDS,
  clearTransientResultFields,
} from '../placeholder-session-state';
import type { GenerationResult } from '../../types/provider';

describe('placeholder-session-state transient registry', () => {
  it('clearTransientResultFields clears exactly TRANSIENT_RESULT_FIELDS keys', () => {
    const cleared = clearTransientResultFields();
    expect(Object.keys(cleared).sort()).toEqual([...TRANSIENT_RESULT_FIELDS].sort());
    for (const key of TRANSIENT_RESULT_FIELDS) {
      expect(cleared[key as keyof GenerationResult]).toBeUndefined();
    }
  });
});
