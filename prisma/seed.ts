import { PrismaClient } from '@prisma/client';
import { PROMPT_KEYS } from '../server/lib/prompts/defaults.ts';
import { PROMPT_DEFAULTS } from '../src/lib/prompts/shared-defaults.ts';

const prisma = new PrismaClient();

const STARTER_SKILL_BODY = `---
name: lattice-html-design
description: >-
  Structured HTML/CSS design guidance for agentic multi-file output. Use when building
  landing pages, marketing UI, or static previews with clear hierarchy and accessible patterns.
---

# Lattice HTML design skill

- Prefer semantic landmarks: \`header\`, \`main\`, \`nav\`, \`footer\`, \`section\`.
- Keep a single clear primary CTA above the fold when the brief implies conversion.
- Use system fonts or web-safe stacks unless the brief specifies a font family.
- Ensure color contrast is readable; avoid text smaller than ~14px for body copy.
- Inline critical layout in HTML; use linked CSS files for larger stylesheets.
`;

async function main() {
  for (const key of PROMPT_KEYS) {
    const existing = await prisma.prompt.findUnique({ where: { key } });
    if (existing) continue; // idempotent — never overwrite existing versions
    await prisma.prompt.create({
      data: {
        key,
        versions: { create: { body: PROMPT_DEFAULTS[key], version: 1 } },
      },
    });
    console.log(`Seeded prompt: ${key}`);
  }

  const skillKey = 'lattice-html-design';
  const skillExisting = await prisma.skill.findUnique({ where: { key: skillKey } });
  if (!skillExisting) {
    await prisma.skill.create({
      data: {
        key: skillKey,
        name: 'Lattice HTML design',
        description:
          'Structured HTML/CSS design guidance for agentic multi-file output. Use for landing pages and static previews.',
        nodeTypes: '*,agentic,html',
        order: 0,
        versions: {
          create: {
            body: STARTER_SKILL_BODY,
            version: 1,
          },
        },
      },
    });
    console.log(`Seeded skill: ${skillKey}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
