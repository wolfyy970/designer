/**
 * Shared incubate → SSE → callbacks path for `incubate` and `e2e` modes.
 */
import type { SimplifiedMetaHarnessTestCase } from './test-case-hydrator.ts';
import { hydrateIncubateRequestFromParsed } from './test-case-hydrator.ts';
import type { IncubationPlan } from '../src/types/incubator.ts';
import type { MetaHarnessConfig } from './config.ts';
import { runIncubateStep } from './incubate-step.ts';
import type { RunnerCallbacks } from './runner-types.ts';
import { withTestCaseHeartbeat } from './eval-heartbeat.ts';

export async function runIncubatePipeline(params: {
  testCase: SimplifiedMetaHarnessTestCase;
  name: string;
  cfg: MetaHarnessConfig;
  incubateProvider: string;
  incubateModel: string;
  incubateHypothesisCountDefault: number;
  promptOverrides?: Record<string, string>;
  apiBaseUrl: string;
  callbacks: RunnerCallbacks;
}): Promise<{ plan: IncubationPlan; requestedCount: number }> {
  const incubateBody = hydrateIncubateRequestFromParsed(params.testCase, {
    incubateProvider: params.incubateProvider,
    incubateModel: params.incubateModel,
    supportsVision: params.cfg.supportsVision,
    defaultHypothesisCount: params.incubateHypothesisCountDefault,
    promptOverrides: params.promptOverrides,
  });
  const requestedCount =
    (incubateBody.promptOptions as { count?: number })?.count ??
    params.incubateHypothesisCountDefault;
  params.callbacks.onIncubateStart?.(params.name, requestedCount);

  const plan = await withTestCaseHeartbeat(params.name, params.callbacks, () =>
    runIncubateStep(params.apiBaseUrl, incubateBody, {
      onWireEvent: (event, payload) => params.callbacks.onWireEvent(params.name, event, payload),
    }),
  );
  if (!plan.hypotheses?.length) {
    throw new Error('Incubate returned no hypotheses');
  }
  params.callbacks.onIncubateDone?.(
    params.name,
    plan.hypotheses.map((h) => ({ name: h.name, id: h.id })),
  );
  return { plan, requestedCount };
}
