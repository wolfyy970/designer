import { describe, it, expect } from 'vitest';
import { roundFilesKey } from '../idb-storage';

describe('idb round file keys', () => {
  it('roundFilesKey uses stable delimiter for GC', () => {
    expect(roundFilesKey('abc-123', 1)).toBe('abc-123:round:1');
    expect(roundFilesKey('abc-123', 2)).toBe('abc-123:round:2');
  });
});
