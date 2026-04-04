import { describe, it, expect, vi } from 'vitest';
import { createUseSkillTool } from '../pi-app-tools.ts';
import type { SkillCatalogEntry } from '../../lib/skill-schema.ts';
import type { ExtensionContext } from '../pi-sdk/types.ts';

const entry: SkillCatalogEntry = {
  key: 'demo',
  dir: '/tmp/demo',
  name: 'Demo',
  description: 'Demo skill',
  tags: [],
  when: 'auto',
  bodyMarkdown: 'Body text\n',
};

describe('createUseSkillTool', () => {
  it('returns skill body and calls onActivate', async () => {
    const onActivate = vi.fn();
    const tool = createUseSkillTool([entry], onActivate);
    const res = await tool.execute(
      'call-1',
      { name: 'demo' },
      undefined as never,
      undefined as never,
      {} as ExtensionContext,
    );
    expect(onActivate).toHaveBeenCalledWith({
      key: 'demo',
      name: 'Demo',
      description: 'Demo skill',
    });
    const first = res.content[0];
    expect(first?.type).toBe('text');
    expect(first && first.type === 'text' ? first.text : '').toContain('Body text');
    expect(first && first.type === 'text' ? first.text : '').toContain('# Demo');
  });

  it('returns error text for unknown skill key', async () => {
    const tool = createUseSkillTool([entry], vi.fn());
    const res = await tool.execute(
      'call-2',
      { name: 'missing' },
      undefined as never,
      undefined as never,
      {} as ExtensionContext,
    );
    const errChunk = res.content[0];
    const errText = errChunk && errChunk.type === 'text' ? errChunk.text : '';
    expect(errText).toMatch(/Unknown skill/);
    expect(errText).toContain('demo');
  });
});
