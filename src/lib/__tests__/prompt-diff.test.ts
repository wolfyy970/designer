import { describe, expect, it } from 'vitest';
import { lineDiff } from '../prompt-diff';

describe('lineDiff', () => {
  it('marks identical single line as same', () => {
    expect(lineDiff('a', 'a')).toEqual([{ type: 'same', text: 'a' }]);
  });

  it('detects add and remove', () => {
    expect(lineDiff('a\nb', 'a\nc')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'add', text: 'c' },
    ]);
  });

  it('handles empty left', () => {
    expect(lineDiff('', 'x')).toEqual([{ type: 'add', text: 'x' }]);
  });

  it('handles empty right', () => {
    expect(lineDiff('x', '')).toEqual([{ type: 'remove', text: 'x' }]);
  });
});
