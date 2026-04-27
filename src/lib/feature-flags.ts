/**
 * Feature flags — shared by client and server.
 * Values live in config/feature-flags.json (0 = off, 1 = on).
 * Validated by Zod at module load; a bad value fails fast with a readable error.
 */
import { z } from 'zod';
import rawFlags from '../../config/feature-flags.json';

const flag = z.union([z.literal(0), z.literal(1)]);

export const FeatureFlagsFileSchema = z
  .object({
    lockdown:    flag,
    autoImprove: flag,
  })
  .strict();

export type FeatureFlags = z.infer<typeof FeatureFlagsFileSchema>;

const FLAGS = FeatureFlagsFileSchema.parse(rawFlags);

/** When true, all LLM routes clamp to OpenRouter + MiniMax M2.5. */
export const FEATURE_LOCKDOWN = FLAGS.lockdown === 1;

/** When true, the evaluator-driven revision loop UI is exposed on hypothesis nodes. */
export const FEATURE_AUTO_IMPROVE = FLAGS.autoImprove === 1;
