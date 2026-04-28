import { Hono } from 'hono';
import { env } from '../env.ts';
import {
  LOCKDOWN_MODEL_ID,
  LOCKDOWN_MODEL_LABEL,
  LOCKDOWN_PROVIDER_ID,
} from '../../src/lib/lockdown-model.ts';
import { FEATURE_LOCKDOWN, FEATURE_AUTO_IMPROVE } from '../../src/lib/feature-flags.ts';
import { DEFAULT_RUBRIC_WEIGHTS } from '../../src/types/evaluation.ts';
import { AppConfigResponseSchema } from '../../src/api/wire-schemas.ts';

const configRoute = new Hono();

configRoute.get('/', (c) => {
  const evaluator = {
    agenticMaxRevisionRounds: env.AGENTIC_MAX_REVISION_ROUNDS,
    agenticMinOverallScore: env.AGENTIC_MIN_OVERALL_SCORE ?? null,
    defaultRubricWeights: { ...DEFAULT_RUBRIC_WEIGHTS },
    maxConcurrentRuns: env.MAX_CONCURRENT_AGENTIC_RUNS,
    autoImprove: FEATURE_AUTO_IMPROVE,
  };
  if (!FEATURE_LOCKDOWN) {
    return c.json(AppConfigResponseSchema.parse({ lockdown: false, ...evaluator }));
  }
  return c.json(AppConfigResponseSchema.parse({
    lockdown: true,
    lockdownProviderId: LOCKDOWN_PROVIDER_ID,
    lockdownModelId: LOCKDOWN_MODEL_ID,
    lockdownModelLabel: LOCKDOWN_MODEL_LABEL,
    ...evaluator,
  }));
});

export default configRoute;
