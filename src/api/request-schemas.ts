import { z } from 'zod';
import { DesignSpecSchema } from '../types/spec';
import { ThinkingOverrideSchema } from '../lib/thinking-defaults';
import { HypothesisStrategySchema } from './hypothesis-request-schemas';

export const DesignSystemExtractRequestSchema = z
  .object({
    title: z.string().optional(),
    content: z.string().optional(),
    sourceHash: z.string().optional(),
    images: z
      .array(
        z.object({
          dataUrl: z.string(),
          mimeType: z.string().optional(),
          name: z.string().optional(),
          filename: z.string().optional(),
          description: z.string().optional(),
        }).passthrough(),
      )
      .optional(),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    thinking: ThinkingOverrideSchema.optional(),
  })
  .refine((body) => Boolean(body.content?.trim()) || Boolean(body.images?.length), {
    message: 'Provide design-system text, reference images, or both.',
  });

export const InternalContextGenerateRequestSchema = z.object({
  spec: DesignSpecSchema,
  sourceHash: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  thinking: ThinkingOverrideSchema.optional(),
});

export const InputsGenerateTargetSchema = z.enum([
  'research-context',
  'objectives-metrics',
  'design-constraints',
]);

export const InputsGenerateRequestSchema = z.object({
  inputId: InputsGenerateTargetSchema,
  designBrief: z.string().min(1),
  researchContext: z.string().optional(),
  objectivesMetrics: z.string().optional(),
  designConstraints: z.string().optional(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  thinking: ThinkingOverrideSchema.optional(),
});

const IncubatorPromptOptionsSchema = z.object({
  count: z.number().int().positive().optional(),
  existingStrategies: z.array(HypothesisStrategySchema).optional(),
  internalContextDocument: z.string().optional(),
  designSystemDocuments: z
    .array(z.object({ nodeId: z.string(), title: z.string(), content: z.string() }))
    .optional(),
});

export const IncubateRequestSchema = z.object({
  spec: DesignSpecSchema,
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  referenceDesigns: z
    .array(
      z.object({
        name: z.string(),
        code: z.string(),
      }),
    )
    .optional(),
  supportsVision: z.boolean().optional(),
  internalContextDocument: z.string().optional(),
  designSystemDocuments: z
    .array(z.object({ nodeId: z.string(), title: z.string(), content: z.string() }))
    .optional(),
  promptOptions: IncubatorPromptOptionsSchema.optional(),
  thinking: ThinkingOverrideSchema.optional(),
});

export type DesignSystemExtractRequestWire = z.infer<typeof DesignSystemExtractRequestSchema>;
export type IncubateRequestWire = z.infer<typeof IncubateRequestSchema>;
export type InputsGenerateRequestWire = z.infer<typeof InputsGenerateRequestSchema>;
export type InternalContextGenerateRequestWire = z.infer<
  typeof InternalContextGenerateRequestSchema
>;
