import { context, trace } from '@opentelemetry/api';
import {
  createTraceId,
  startActiveObservation,
  type LangfuseGeneration,
  type LangfuseGenerationAttributes,
} from '@langfuse/tracing';
import { isLangfuseTracingEnabled } from './langfuse-tracing-enabled.ts';

const SYNTHETIC_PARENT_SPAN_ID = '0000000000000001';

type GenerationUpdater = (attrs: LangfuseGenerationAttributes) => void;

/** Runs `fn` with an optional Langfuse generation observation (nested when OTEL context exists). */
export async function runWithOptionalLlmGeneration<T>(
  observationName: string,
  correlationId: string | undefined,
  fn: (updateGeneration: GenerationUpdater) => Promise<T>,
): Promise<T> {
  if (!isLangfuseTracingEnabled()) {
    return fn(() => {});
  }
  const activeSpan = trace.getSpan(context.active());
  const opts: {
    asType: 'generation';
    parentSpanContext?: { traceId: string; spanId: string; traceFlags: number };
  } = { asType: 'generation' };
  if (!activeSpan && correlationId) {
    opts.parentSpanContext = {
      traceId: await createTraceId(correlationId),
      spanId: SYNTHETIC_PARENT_SPAN_ID,
      traceFlags: 1,
    };
  }
  return startActiveObservation(
    observationName,
    async (gen: LangfuseGeneration) => {
      return fn((attrs) => {
        gen.update(attrs);
      });
    },
    opts,
  );
}
