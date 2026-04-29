import { z } from "zod";
const LOCKDOWN_PROVIDER_ID = "openrouter";
const LOCKDOWN_MODEL_ID = "minimax/minimax-m2.5";
const LOCKDOWN_MODEL_LABEL = "MiniMax M2.5";
const lockdown = 1;
const autoImprove = 0;
const rawFlags = {
  lockdown,
  autoImprove
};
const flag = z.union([z.literal(0), z.literal(1)]);
const FeatureFlagsFileSchema = z.object({
  lockdown: flag,
  autoImprove: flag
}).strict();
const FLAGS = FeatureFlagsFileSchema.parse(rawFlags);
const FEATURE_LOCKDOWN = FLAGS.lockdown === 1;
const FEATURE_AUTO_IMPROVE = FLAGS.autoImprove === 1;
export {
  FEATURE_LOCKDOWN as F,
  LOCKDOWN_MODEL_LABEL as L,
  FEATURE_AUTO_IMPROVE as a,
  LOCKDOWN_MODEL_ID as b,
  LOCKDOWN_PROVIDER_ID as c
};
