import { describe, expect, it } from 'vitest';
import { emitSkillsLoadedEvents } from '../agentic-skills-emission.ts';

describe('emitSkillsLoadedEvents', () => {
  it('emits trace then skills_loaded with matching catalog label', async () => {
    const out: Array<{ type: string; skills?: unknown; trace?: { kind?: string; label?: string; phase?: string } }> =
      [];
    await emitSkillsLoadedEvents(
      async (e) => {
        out.push(e);
      },
      [
        { key: 'a', name: 'Skill A', description: '' },
        { key: 'b', name: 'Skill B', description: '' },
      ],
      'building',
    );
    expect(out).toHaveLength(2);
    expect(out[0]?.type).toBe('trace');
    expect(out[0]?.trace?.kind).toBe('skills_loaded');
    expect(out[0]?.trace?.phase).toBe('building');
    expect(String(out[0]?.trace?.label)).toContain('Skill A');
    expect(out[1]?.type).toBe('skills_loaded');
    expect((out[1] as { skills: unknown[] }).skills).toHaveLength(2);
  });

  it('uses info status when catalog is empty', async () => {
    const out: Array<{ type: string; trace?: { status?: string } }> = [];
    await emitSkillsLoadedEvents(async (e) => {
      out.push(e);
    }, [], 'evaluating');
    expect(out[0]?.trace?.status).toBe('info');
    expect(out[1]?.type).toBe('skills_loaded');
  });
});
