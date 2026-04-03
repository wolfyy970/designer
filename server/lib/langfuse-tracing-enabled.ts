import { env } from '../env.ts';

/** True when OTEL export to Langfuse should run (keys present; never in Vitest). */
export function isLangfuseTracingEnabled(): boolean {
  return env.langfuseTracingEnabled;
}
