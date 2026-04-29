import { z } from "zod";
const design = 0.4;
const strategy = 0.3;
const implementation = 0.2;
const browser = 0.1;
const rubricWeightsJson = {
  design,
  strategy,
  implementation,
  browser
};
const EVALUATOR_RUBRIC_IDS = ["design", "strategy", "implementation", "browser"];
const RubricWeightsFileSchema = z.object({ design: z.number().min(0), strategy: z.number().min(0), implementation: z.number().min(0), browser: z.number().min(0) }).strict();
const _parsedWeights = RubricWeightsFileSchema.parse(rubricWeightsJson);
const DEFAULT_RUBRIC_WEIGHTS = _parsedWeights;
EVALUATOR_RUBRIC_IDS.length;
export {
  DEFAULT_RUBRIC_WEIGHTS as D,
  EVALUATOR_RUBRIC_IDS as E
};
