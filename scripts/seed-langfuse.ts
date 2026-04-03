/**
 * Bootstrap / sync Langfuse text prompts (replaces `prisma db seed` after Prisma removal).
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

async function main(): Promise<void> {
  const { seedLangfusePromptsFromDefaults } = await import('../server/lib/langfuse-seed-prompts.ts');
  await seedLangfusePromptsFromDefaults();
}

main().catch(console.error);
