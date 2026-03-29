import { describe, it, expect } from 'vitest';
import { selectSkillsForContext, type SkillRow } from '../select-skills.ts';

const rows: SkillRow[] = [
  { key: 'a', name: 'A', description: 'd', nodeTypes: 'html' },
  { key: 'b', name: 'B', description: 'd', nodeTypes: 'react' },
  { key: 'c', name: 'C', description: 'd', nodeTypes: '*' },
  { key: 'd', name: 'D', description: 'd', nodeTypes: 'agentic' },
];

describe('selectSkillsForContext', () => {
  it('matches outputFormat against nodeTypes', () => {
    const s = selectSkillsForContext(rows, { outputFormat: 'html' });
    expect(s.map((x) => x.key).sort()).toEqual(['a', 'c', 'd']);
  });

  it('matches react format', () => {
    const s = selectSkillsForContext(rows, { outputFormat: 'react' });
    expect(s.map((x) => x.key).sort()).toEqual(['b', 'c', 'd']);
  });

  it('wildcard and agentic match without format', () => {
    const s = selectSkillsForContext(rows, {});
    expect(s.map((x) => x.key).sort()).toEqual(['c', 'd']);
  });
});
