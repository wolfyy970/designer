import { FEATURE_LOCKDOWN } from '../../src/lib/feature-flags.ts';
import { LOCKDOWN_MODEL_ID, LOCKDOWN_PROVIDER_ID } from '../../src/lib/lockdown-model.ts';
import type { HypothesisGenerationContext } from '../../src/workspace/hypothesis-generation-pure.ts';

export function isLockdownEnabled(): boolean {
  return FEATURE_LOCKDOWN;
}

export function clampProviderModel(
  providerId: string,
  modelId: string,
): { providerId: string; modelId: string } {
  if (!isLockdownEnabled()) return { providerId, modelId };
  return { providerId: LOCKDOWN_PROVIDER_ID, modelId: LOCKDOWN_MODEL_ID };
}

/** When lockdown, LLM evaluators use the same pinned model; otherwise preserve optional overrides. */
export function clampEvaluatorOptional(
  evaluatorProviderId: string | undefined,
  evaluatorModelId: string | undefined,
): { evaluatorProviderId?: string; evaluatorModelId?: string } {
  if (!isLockdownEnabled()) {
    return { evaluatorProviderId, evaluatorModelId };
  }
  return {
    evaluatorProviderId: LOCKDOWN_PROVIDER_ID,
    evaluatorModelId: LOCKDOWN_MODEL_ID,
  };
}

export function applyLockdownToHypothesisContext(
  ctx: HypothesisGenerationContext,
): HypothesisGenerationContext {
  if (!isLockdownEnabled()) return ctx;
  return {
    ...ctx,
    modelCredentials: ctx.modelCredentials.map((c) => {
      const pin = clampProviderModel(c.providerId, c.modelId);
      return { ...c, providerId: pin.providerId, modelId: pin.modelId };
    }),
  };
}
