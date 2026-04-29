import { Hono } from "hono";
import { e as env } from "../[[...route]].js";
import { F as FEATURE_LOCKDOWN, a as FEATURE_AUTO_IMPROVE, L as LOCKDOWN_MODEL_LABEL, b as LOCKDOWN_MODEL_ID, c as LOCKDOWN_PROVIDER_ID } from "./feature-flags-XVIYZipX.js";
import { D as DEFAULT_RUBRIC_WEIGHTS } from "./evaluation-BqxRe2Wx.js";
import { A as AppConfigResponseSchema } from "./wire-schemas-MuEb8lng.js";
import "@hono/node-server/vercel";
import "hono/cors";
import "hono/body-limit";
import "dotenv";
import "node:path";
import "zod";
import "./thinking-defaults-BkNuccwq.js";
import "./model-capabilities--LonKxeT.js";
const configRoute = new Hono();
configRoute.get("/", (c) => {
  const evaluator = {
    agenticMaxRevisionRounds: env.AGENTIC_MAX_REVISION_ROUNDS,
    agenticMinOverallScore: env.AGENTIC_MIN_OVERALL_SCORE ?? null,
    defaultRubricWeights: { ...DEFAULT_RUBRIC_WEIGHTS },
    maxConcurrentRuns: env.MAX_CONCURRENT_AGENTIC_RUNS,
    autoImprove: FEATURE_AUTO_IMPROVE
  };
  if (!FEATURE_LOCKDOWN) {
    return c.json(AppConfigResponseSchema.parse({ lockdown: false, ...evaluator }));
  }
  return c.json(AppConfigResponseSchema.parse({
    lockdown: true,
    lockdownProviderId: LOCKDOWN_PROVIDER_ID,
    lockdownModelId: LOCKDOWN_MODEL_ID,
    lockdownModelLabel: LOCKDOWN_MODEL_LABEL,
    ...evaluator
  }));
});
export {
  configRoute as default
};
