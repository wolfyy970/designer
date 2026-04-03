/**
 * OpenTelemetry + Langfuse export. Must load before other server modules that emit spans.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { env } from './env.ts';
import { isLangfuseTracingEnabled } from './lib/langfuse-tracing-enabled.ts';

let sdk: NodeSDK | null = null;

if (isLangfuseTracingEnabled()) {
  sdk = new NodeSDK({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: env.LANGFUSE_PUBLIC_KEY.trim(),
        secretKey: env.LANGFUSE_SECRET_KEY.trim(),
        baseUrl: env.LANGFUSE_BASE_URL,
      }),
    ],
  });
  sdk.start();
}

export function shutdownInstrumentation(): Promise<void> {
  if (!sdk) return Promise.resolve();
  return sdk.shutdown();
}
