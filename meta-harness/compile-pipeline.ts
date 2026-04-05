/**
 * Shared compile → SSE → callbacks path for `compile` and `e2e` modes.
 */
import type { SimplifiedMetaHarnessTestCase } from './test-case-hydrator.ts';
import { hydrateCompileRequestFromParsed } from './test-case-hydrator.ts';
import type { IncubationPlan } from '../src/types/compiler.ts';
import type { MetaHarnessConfig } from './config.ts';
import { runCompileStep } from './compile-step.ts';
import type { RunnerCallbacks } from './runner-types.ts';
import { withTestCaseHeartbeat } from './eval-heartbeat.ts';

export async function runCompilePipeline(params: {
  testCase: SimplifiedMetaHarnessTestCase;
  name: string;
  cfg: MetaHarnessConfig;
  compileProvider: string;
  compileModel: string;
  compileHypothesisCountDefault: number;
  promptOverrides?: Record<string, string>;
  apiBaseUrl: string;
  callbacks: RunnerCallbacks;
}): Promise<{ plan: IncubationPlan; requestedCount: number }> {
  const compileBody = hydrateCompileRequestFromParsed(params.testCase, {
    compileProvider: params.compileProvider,
    compileModel: params.compileModel,
    supportsVision: params.cfg.supportsVision,
    defaultHypothesisCount: params.compileHypothesisCountDefault,
    promptOverrides: params.promptOverrides,
  });
  const requestedCount =
    (compileBody.promptOptions as { count?: number })?.count ?? params.compileHypothesisCountDefault;
  params.callbacks.onCompileStart?.(params.name, requestedCount);

  const plan = await withTestCaseHeartbeat(params.name, params.callbacks, () =>
    runCompileStep(params.apiBaseUrl, compileBody, {
      onWireEvent: (event, payload) => params.callbacks.onWireEvent(params.name, event, payload),
    }),
  );
  if (!plan.hypotheses?.length) {
    throw new Error('Compile returned no hypotheses');
  }
  params.callbacks.onCompileDone?.(
    params.name,
    plan.hypotheses.map((h) => ({ name: h.name, id: h.id })),
  );
  return { plan, requestedCount };
}
