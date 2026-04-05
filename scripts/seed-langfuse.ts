/**
 * Bootstrap / sync Langfuse text prompts (replaces `prisma db seed` after Prisma removal).
 * With `LANGFUSE_SEED_SYNC=1` (`pnpm langfuse:sync-prompts`), drift vs repo creates **new prompt versions**
 * via Langfuse `prompt.create`; the label moves forward; prior versions stay for history in the UI.
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

async function main(): Promise<void> {
  const { seedLangfusePromptsFromDefaults } = await import('../server/lib/langfuse-seed-prompts.ts');
  await seedLangfusePromptsFromDefaults();
}

main().catch(console.error);
