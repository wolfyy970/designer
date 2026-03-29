import { PrismaClient } from '@prisma/client';
import { PROMPT_KEYS } from '../server/lib/prompts/defaults.ts';
import { PROMPT_DEFAULTS } from '../src/lib/prompts/shared-defaults.ts';

const prisma = new PrismaClient();

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
}

main().catch(console.error).finally(() => prisma.$disconnect());
