/**
 * Expand simplified meta-harness benchmark JSON into POST /api/hypothesis/generate bodies.
 */
import { z } from 'zod';
import { GENERATION_MODE } from '../src/constants/generation.ts';
import { generateId, now } from '../src/lib/utils.ts';
import type { DesignSpec, SpecSection } from '../src/types/spec.ts';
import { HypothesisGenerateRequestSchema, ThinkingLevelSchema } from '../server/lib/hypothesis-schemas.ts';

export const MH_MODEL_NODE = 'mh-model';
export const MH_HYPOTHESIS_NODE = 'mh-hypothesis';
const MH_INCUBATOR_ID = 'mh-incubator';

const SECTION_KEYS = [
  'design-brief',
  'existing-design',
  'research-context',
  'objectives-metrics',
  'design-constraints',
] as const;

const SimplifiedModelSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  thinkingLevel: ThinkingLevelSchema.optional(),
});

const SimplifiedStrategySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hypothesis: z.string().min(1),
  rationale: z.string().min(1),
  measurements: z.string().min(1),
  dimensionValues: z.record(z.string(), z.string()),
});

const SimplifiedSpecSchema = z.object({
  title: z.string().min(1),
  sections: z.record(
    z.string(),
    z.union([z.string(), z.object({ content: z.string() }).passthrough()]),
  ),
});

const SimplifiedCompileBlockSchema = z
  .object({
    /** Requested number of hypotheses from POST /api/compile (promptOptions.count). */
    hypothesisCount: z.number().int().positive().max(20).optional(),
  })
  .optional();

export const SimplifiedMetaHarnessTestCaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  spec: SimplifiedSpecSchema,
  strategy: SimplifiedStrategySchema.optional(),
  compile: SimplifiedCompileBlockSchema,
  model: SimplifiedModelSchema,
});

export type SimplifiedMetaHarnessTestCase = z.infer<typeof SimplifiedMetaHarnessTestCaseSchema>;

function sectionFromFlexible(key: string, val: unknown, ts: string): SpecSection {
  const content =
    typeof val === 'string'
      ? val
      : val && typeof val === 'object' && 'content' in val && typeof (val as { content: unknown }).content === 'string'
        ? (val as { content: string }).content
        : '';
  return {
    id: key as SpecSection['id'],
    content,
    images: [],
    lastModified: ts,
  };
}

function normalizeSectionContent(val: unknown): string {
  if (typeof val === 'string') return val;
  if (
    val &&
    typeof val === 'object' &&
    'content' in val &&
    typeof (val as { content: unknown }).content === 'string'
  ) {
    return (val as { content: string }).content;
  }
  return '';
}

export function buildDesignSpecFromSimplified(spec: SimplifiedMetaHarnessTestCase['spec']): DesignSpec {
  const id = generateId();
  const ts = now();
  const sections: DesignSpec['sections'] = {} as DesignSpec['sections'];
  let briefExtra = '';
  for (const [key, val] of Object.entries(spec.sections)) {
    if ((SECTION_KEYS as readonly string[]).includes(key)) continue;
    const c = normalizeSectionContent(val).trim();
    if (c) briefExtra += `\n## ${key}\n${c}\n`;
  }
  for (const key of SECTION_KEYS) {
    const raw = spec.sections[key];
    let content = normalizeSectionContent(raw ?? '');
    if (key === 'design-brief' && briefExtra) content = `${content}${briefExtra}`;
    sections[key] = sectionFromFlexible(key, content, ts);
  }
  return {
    id,
    title: spec.title,
    sections,
    createdAt: ts,
    lastModified: ts,
    version: 1,
  };
}

export type HydrateOptions = {
  defaultCompilerProvider: string;
  correlationId?: string;
  promptOverrides?: Record<string, string>;
  supportsVision?: boolean;
  agenticMaxRevisionRounds?: number;
  agenticMinOverallScore?: number;
  /** Merged with server defaults; used for agentic evaluation overall score only. */
  rubricWeights?: Record<string, number>;
  evaluatorProviderId?: string;
  evaluatorModelId?: string;
  /** When set (e.g. e2e random pick), overrides `strategy` from the test case JSON. */
  strategyOverride?: z.infer<typeof SimplifiedStrategySchema>;
};

export type HydrateCompileRequestOptions = {
  compileProvider: string;
  compileModel: string;
  supportsVision?: boolean;
  /** Default when test case omits `compile.hypothesisCount`. */
  defaultHypothesisCount?: number;
  promptOverrides?: Record<string, string>;
};

/** Build POST /api/compile JSON body from a simplified benchmark file. */
export function hydrateCompileRequest(
  raw: unknown,
  options: HydrateCompileRequestOptions,
): Record<string, unknown> {
  const simplified = SimplifiedMetaHarnessTestCaseSchema.parse(raw);
  const spec = buildDesignSpecFromSimplified(simplified.spec);
  const count =
    simplified.compile?.hypothesisCount ?? options.defaultHypothesisCount ?? 5;
  return {
    spec,
    providerId: options.compileProvider,
    modelId: options.compileModel,
    ...(options.supportsVision !== undefined ? { supportsVision: options.supportsVision } : {}),
    promptOptions: { count },
    ...(options.promptOverrides && Object.keys(options.promptOverrides).length > 0
      ? { promptOverrides: options.promptOverrides }
      : {}),
  };
}

/** Parse simplified JSON then validate full hypothesis generate request shape. */
export function hydrateMetaHarnessTestCase(
  raw: unknown,
  options: HydrateOptions,
): z.infer<typeof HypothesisGenerateRequestSchema> {
  const simplified = SimplifiedMetaHarnessTestCaseSchema.parse(raw);
  const designSpec = buildDesignSpecFromSimplified(simplified.spec);
  const strategy = options.strategyOverride ?? simplified.strategy;
  if (!strategy) {
    throw new Error(
      'Test case must include "strategy" unless strategyOverride is provided (e2e/design generate path).',
    );
  }

  const body = {
    hypothesisNodeId: MH_HYPOTHESIS_NODE,
    strategy,
    spec: designSpec,
    snapshot: { nodes: [], edges: [] },
    domainHypothesis: {
      id: MH_HYPOTHESIS_NODE,
      incubatorId: MH_INCUBATOR_ID,
      strategyId: strategy.id,
      modelNodeIds: [MH_MODEL_NODE],
      designSystemNodeIds: [],
      agentMode: GENERATION_MODE.AGENTIC,
      placeholder: false,
    },
    modelProfiles: {
      [MH_MODEL_NODE]: {
        nodeId: MH_MODEL_NODE,
        providerId: simplified.model.providerId,
        modelId: simplified.model.modelId,
        ...(simplified.model.thinkingLevel ? { thinkingLevel: simplified.model.thinkingLevel } : {}),
      },
    },
    designSystems: {},
    defaultCompilerProvider: options.defaultCompilerProvider,
    ...(options.supportsVision !== undefined ? { supportsVision: options.supportsVision } : {}),
    ...(options.promptOverrides && Object.keys(options.promptOverrides).length > 0
      ? { promptOverrides: options.promptOverrides }
      : {}),
    ...(options.correlationId ? { correlationId: options.correlationId } : {}),
    ...(options.agenticMaxRevisionRounds !== undefined
      ? { agenticMaxRevisionRounds: options.agenticMaxRevisionRounds }
      : {}),
    ...(options.agenticMinOverallScore !== undefined
      ? { agenticMinOverallScore: options.agenticMinOverallScore }
      : {}),
    ...(options.rubricWeights && Object.keys(options.rubricWeights).length > 0
      ? { rubricWeights: options.rubricWeights }
      : {}),
    ...(options.evaluatorProviderId ? { evaluatorProviderId: options.evaluatorProviderId } : {}),
    ...(options.evaluatorModelId ? { evaluatorModelId: options.evaluatorModelId } : {}),
  };

  return HypothesisGenerateRequestSchema.parse(body);
}
