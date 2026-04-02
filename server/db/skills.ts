import { z } from 'zod';
import { prisma } from './client.ts';
import type { SkillRow } from '../lib/skills/select-skills.ts';

const skillFilesJsonSchema = z.record(z.string(), z.string());

export type { SkillRow };

export interface SkillVersionResolved {
  skillKey: string;
  name: string;
  description: string;
  nodeTypes: string;
  body: string;
  filesJson: string | null;
  version: number;
}

/** Latest version per skill, ordered by Skill.order then key. */
export async function listLatestSkillVersions(): Promise<SkillVersionResolved[]> {
  const skills = await prisma.skill.findMany({
    orderBy: [{ order: 'asc' }, { key: 'asc' }],
    include: {
      versions: { orderBy: { version: 'desc' }, take: 1 },
    },
  });

  const out: SkillVersionResolved[] = [];
  for (const s of skills) {
    const v = s.versions[0];
    if (!v) continue;
    out.push({
      skillKey: s.key,
      name: s.name,
      description: s.description,
      nodeTypes: s.nodeTypes,
      body: v.body,
      filesJson: v.filesJson ?? null,
      version: v.version,
    });
  }
  return out;
}

/** Virtual paths for PI workspace: `skills/{key}/…` */
export function buildVirtualSkillFiles(resolved: SkillVersionResolved): Record<string, string> {
  const root = `skills/${resolved.skillKey}`;
  const map: Record<string, string> = {};

  if (resolved.filesJson?.trim()) {
    try {
      const parsedJson: unknown = JSON.parse(resolved.filesJson);
      const parsed = skillFilesJsonSchema.safeParse(parsedJson);
      if (parsed.success) {
        for (const [rel, text] of Object.entries(parsed.data)) {
          const norm = rel.replace(/^\/+/, '');
          map[`${root}/${norm}`] = text;
        }
      } else {
        map[`${root}/SKILL.md`] = resolved.body;
      }
    } catch {
      map[`${root}/SKILL.md`] = resolved.body;
    }
  } else {
    map[`${root}/SKILL.md`] = resolved.body;
  }

  return map;
}
