import { describe, it, expect } from 'vitest';
import {
  decodeStrategyStreamingSnapshot,
  encodeStrategyStreamingSnapshot,
} from '../strategy-streaming-snapshot';

describe('strategy-streaming-snapshot', () => {
  it('round-trips tool name, chars, and path', () => {
    const s = encodeStrategyStreamingSnapshot('write_file', 2048, '/src/a b.html');
    expect(decodeStrategyStreamingSnapshot(s)).toEqual({
      name: 'write_file',
      chars: 2048,
      path: '/src/a b.html',
    });
  });

  it('returns null for malformed input', () => {
    expect(decodeStrategyStreamingSnapshot('')).toBeNull();
    expect(decodeStrategyStreamingSnapshot('x')).toBeNull();
    expect(decodeStrategyStreamingSnapshot('NaN\u001fname\u001f')).toBeNull();
  });
});
