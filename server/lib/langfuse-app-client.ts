import { LangfuseClient } from '@langfuse/client';
import { env } from '../env.ts';

let singleton: LangfuseClient | null = null;

export function getLangfuseAppClient(): LangfuseClient {
  if (!env.LANGFUSE_SECRET_KEY.trim() || !env.LANGFUSE_PUBLIC_KEY.trim()) {
    throw new Error(
      'Langfuse is not configured. Set LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL in .env.local (see .env.example; cloud: https://langfuse.com/docs/deployment/cloud).',
    );
  }
  if (!singleton) {
    singleton = new LangfuseClient({
      publicKey: env.LANGFUSE_PUBLIC_KEY.trim(),
      secretKey: env.LANGFUSE_SECRET_KEY.trim(),
      baseUrl: env.LANGFUSE_BASE_URL,
    });
  }
  return singleton;
}

export function isLangfuseAppConfigured(): boolean {
  return Boolean(
    env.LANGFUSE_SECRET_KEY.trim() && env.LANGFUSE_PUBLIC_KEY.trim() && env.LANGFUSE_BASE_URL,
  );
}
