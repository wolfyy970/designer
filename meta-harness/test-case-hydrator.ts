/**
 * Expand simplified meta-harness benchmark JSON into POST /api/hypothesis/generate bodies.
 */
import { z } from 'zod';
import { generateId, now } from '../src/lib/utils.ts';
import type { DesignSpec, SpecSection } from '../src/types/spec.ts';
import { HypothesisGenerateRequestSchema, ThinkingLevelSchema } from '../server/lib/hypothesis-schemas.ts';
import { DEFAULT_HYPOTHESIS_COUNT, SECTION_KEYS } from './constants.ts';

/** POST /api/hypothesis/generate JSON body produced by the meta-harness hydrator. */
export type MetaHarnessHypothesisGenerateBody = z.infer<typeof HypothesisGenerateRequestSchema>;

export const MH_MODEL_NODE = 'mh-model';
export const MH_HYPOTHESIS_NODE = 'mh-hypothesis';
const MH_INCUBATOR_ID = 'mh-incubator';

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

const SimplifiedIncubateBlockSchema = z
  .object({
    /** Requested number of hypotheses from POST /api/incubate (promptOptions.count). */
    hypothesisCount: z.number().int().positive().max(20).optional(),
  })
  .optional();

export const SimplifiedMetaHarnessTestCaseSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  spec: SimplifiedSpecSchema,
  strategy: SimplifiedStrategySchema.optional(),
  incubate: SimplifiedIncubateBlockSchema,
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

type HydrateOptions = {
  defaultIncubatorProvider: string;
  correlationId?: string;
  promptOverrides?: Record<string, string>;
  supportsVision?: boolean;
  agenticMaxRevisionRounds?: number;
  /** Merged with server defaults; used for agentic evaluation overall score only. */
  rubricWeights?: Record<string, number>;
  evaluatorProviderId?: string;
  evaluatorModelId?: string;
  /** When set (e.g. e2e random pick), overrides `strategy` from the test case JSON. */
  strategyOverride?: z.infer<typeof SimplifiedStrategySchema>;
};

type HydrateIncubateRequestOptions = {
  incubateProvider: string;
  incubateModel: string;
  supportsVision?: boolean;
  /** Default when test case omits `incubate.hypothesisCount`. */
  defaultHypothesisCount?: number;
  promptOverrides?: Record<string, string>;
};

/** Build POST /api/incubate JSON body from an already-validated simplified test case. */
export function hydrateIncubateRequestFromParsed(
  simplified: SimplifiedMetaHarnessTestCase,
  options: HydrateIncubateRequestOptions,
): Record<string, unknown> {
  const spec = buildDesignSpecFromSimplified(simplified.spec);
  const count =
    simplified.incubate?.hypothesisCount ?? options.defaultHypothesisCount ?? DEFAULT_HYPOTHESIS_COUNT;
  return {
    spec,
    providerId: options.incubateProvider,
    modelId: options.incubateModel,
    ...(options.supportsVision !== undefined ? { supportsVision: options.supportsVision } : {}),
    promptOptions: { count },
    ...(options.promptOverrides && Object.keys(options.promptOverrides).length > 0
      ? { promptOverrides: options.promptOverrides }
      : {}),
  };
}

/** Build POST /api/incubate JSON body from a simplified benchmark file. */
export function hydrateIncubateRequest(
  raw: unknown,
  options: HydrateIncubateRequestOptions,
): Record<string, unknown> {
  return hydrateIncubateRequestFromParsed(SimplifiedMetaHarnessTestCaseSchema.parse(raw), options);
}

/** Build hypothesis generate body from an already-validated simplified test case. */
export function hydrateMetaHarnessTestCaseFromParsed(
  simplified: SimplifiedMetaHarnessTestCase,
  options: HydrateOptions,
): MetaHarnessHypothesisGenerateBody {
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
      revisionEnabled: true,
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
    defaultIncubatorProvider: options.defaultIncubatorProvider,
    ...(options.supportsVision !== undefined ? { supportsVision: options.supportsVision } : {}),
    ...(options.promptOverrides && Object.keys(options.promptOverrides).length > 0
      ? { promptOverrides: options.promptOverrides }
      : {}),
    ...(options.correlationId ? { correlationId: options.correlationId } : {}),
    ...(options.agenticMaxRevisionRounds !== undefined
      ? { agenticMaxRevisionRounds: options.agenticMaxRevisionRounds }
      : {}),
    ...(options.rubricWeights && Object.keys(options.rubricWeights).length > 0
      ? { rubricWeights: options.rubricWeights }
      : {}),
    ...(options.evaluatorProviderId ? { evaluatorProviderId: options.evaluatorProviderId } : {}),
    ...(options.evaluatorModelId ? { evaluatorModelId: options.evaluatorModelId } : {}),
  };

  return HypothesisGenerateRequestSchema.parse(body);
}

/** Parse simplified JSON then validate full hypothesis generate request shape. */
export function hydrateMetaHarnessTestCase(
  raw: unknown,
  options: HydrateOptions,
): MetaHarnessHypothesisGenerateBody {
  return hydrateMetaHarnessTestCaseFromParsed(SimplifiedMetaHarnessTestCaseSchema.parse(raw), options);
}
