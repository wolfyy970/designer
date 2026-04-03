import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

async function main() {
  const { seedLangfusePromptsFromDefaults } = await import('../server/lib/langfuse-seed-prompts.ts');
  await seedLangfusePromptsFromDefaults();
}

main().catch(console.error);
