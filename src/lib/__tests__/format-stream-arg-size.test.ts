import { describe, it, expect } from 'vitest';
import { formatStreamArgSize } from '../format-stream-arg-size';

describe('formatStreamArgSize', () => {
  it('uses chars under 1k', () => {
    expect(formatStreamArgSize(0)).toBe('0 chars');
    expect(formatStreamArgSize(1023)).toBe('1023 chars');
  });

  it('uses KB with one decimal at and above 1k', () => {
    expect(formatStreamArgSize(1024)).toBe('1.0 KB');
    expect(formatStreamArgSize(1536)).toBe('1.5 KB');
  });
});
