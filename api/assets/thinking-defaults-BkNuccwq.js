import { z } from "zod";
import { s as supportsReasoningModel } from "./model-capabilities--LonKxeT.js";
const ReferenceImageSchema = z.object({
  id: z.string(),
  filename: z.string(),
  dataUrl: z.string(),
  description: z.string(),
  extractedContext: z.string().optional(),
  createdAt: z.string()
});
const SpecSectionSchema = z.object({
  id: z.enum([
    "design-brief",
    "existing-design",
    "research-context",
    "objectives-metrics",
    "design-constraints",
    "design-system"
  ]),
  content: z.string(),
  images: z.array(ReferenceImageSchema),
  lastModified: z.string()
});
const InternalContextDocumentSchema = z.object({
  content: z.string(),
  sourceHash: z.string(),
  generatedAt: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  error: z.string().optional()
});
const DesignSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  sections: z.record(z.string(), SpecSectionSchema),
  internalContextDocument: InternalContextDocumentSchema.optional(),
  createdAt: z.string(),
  lastModified: z.string(),
  version: z.number()
});
const perTaskDefaults = { "design": { "level": "high", "budgetTokens": 2e4 }, "incubate": { "level": "high", "budgetTokens": 2e4 }, "internal-context": { "level": "high", "budgetTokens": 2e4 }, "inputs": { "level": "medium", "budgetTokens": 5e3 }, "design-system": { "level": "high", "budgetTokens": 2e4 }, "evaluator": { "level": "low", "budgetTokens": 2048 } };
const budgetByLevel = { "off": 0, "minimal": 1024, "low": 2048, "medium": 5e3, "high": 2e4, "xhigh": 32768 };
const budgetBounds = { "minTokens": 1024, "maxTokens": 32768 };
const rawConfig = {
  perTaskDefaults,
  budgetByLevel,
  budgetBounds
};
const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh"
];
const THINKING_TASKS = [
  "design",
  "incubate",
  "internal-context",
  "inputs",
  "design-system",
  "evaluator"
];
const THINKING_OFF = { level: "off", budgetTokens: 0 };
const ThinkingLevelSchema = z.enum(THINKING_LEVELS);
z.enum(THINKING_TASKS);
const ThinkingConfigSchema = z.object({
  level: ThinkingLevelSchema,
  budgetTokens: z.number().int().min(0)
});
const ThinkingOverrideSchema = z.object({
  level: ThinkingLevelSchema.optional(),
  budgetTokens: z.number().int().min(0).optional()
}).strict();
const perTaskDefaultsShape = Object.fromEntries(
  THINKING_TASKS.map((task) => [task, ThinkingConfigSchema])
);
const budgetByLevelShape = Object.fromEntries(
  THINKING_LEVELS.map((level) => [level, z.number().int().min(0)])
);
const ThinkingDefaultsFileSchema = z.object({
  perTaskDefaults: z.object(perTaskDefaultsShape).strict(),
  budgetByLevel: z.object(budgetByLevelShape).strict(),
  budgetBounds: z.object({
    minTokens: z.number().int().min(1),
    maxTokens: z.number().int().min(1024)
  }).strict().refine((b) => b.maxTokens >= b.minTokens, {
    message: "budgetBounds.maxTokens must be >= budgetBounds.minTokens"
  })
}).strict();
const CONFIG = ThinkingDefaultsFileSchema.parse(rawConfig);
const THINKING_BUDGET_MIN_TOKENS = CONFIG.budgetBounds.minTokens;
const THINKING_BUDGET_MAX_TOKENS = CONFIG.budgetBounds.maxTokens;
CONFIG.budgetByLevel;
const THINKING_CONFIG_DEFAULTS = CONFIG.perTaskDefaults;
function clampBudget(n) {
  if (Number.isNaN(n)) return THINKING_BUDGET_MIN_TOKENS;
  if (n >= THINKING_BUDGET_MAX_TOKENS) return THINKING_BUDGET_MAX_TOKENS;
  if (n <= THINKING_BUDGET_MIN_TOKENS) return THINKING_BUDGET_MIN_TOKENS;
  return Math.round(n);
}
function resolveThinkingConfig(task, modelId, override) {
  if (!modelId || !supportsReasoningModel(modelId)) return THINKING_OFF;
  const defaults = THINKING_CONFIG_DEFAULTS[task];
  const level = override?.level ?? defaults.level;
  if (level === "off") return THINKING_OFF;
  const rawBudget = override?.budgetTokens ?? defaults.budgetTokens;
  return { level, budgetTokens: clampBudget(rawBudget) };
}
export {
  DesignSpecSchema as D,
  ReferenceImageSchema as R,
  ThinkingLevelSchema as T,
  THINKING_LEVELS as a,
  ThinkingOverrideSchema as b,
  resolveThinkingConfig as r
};
