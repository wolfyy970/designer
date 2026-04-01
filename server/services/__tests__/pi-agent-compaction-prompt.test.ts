import { describe, it, expect } from 'vitest';
import { COMPACTION_SYSTEM_PROMPT } from '../pi-agent-compaction.ts';

describe('COMPACTION_SYSTEM_PROMPT', () => {
  it('does not prescribe a fixed three-file bundle or hardcoded css/js names', () => {
    expect(COMPACTION_SYSTEM_PROMPT).not.toMatch(/three-file/i);
    expect(COMPACTION_SYSTEM_PROMPT).not.toContain('styles.css');
    expect(COMPACTION_SYSTEM_PROMPT).not.toContain('app.js');
  });

  it('describes flexible local static artifact constraints', () => {
    expect(COMPACTION_SYSTEM_PROMPT).toMatch(/index\.html/i);
    expect(COMPACTION_SYSTEM_PROMPT).toMatch(/flexible|multi-file/i);
  });
});
