import { z } from 'zod';

export type SpecSectionId =
  | 'design-brief'
  | 'existing-design'
  | 'research-context'
  | 'objectives-metrics'
  | 'design-constraints'
  /** @deprecated Design System content now lives in DesignSystemNode canvas node data.
   *  Kept for backward compatibility with spec import/export and legacy routes. */
  | 'design-system';

export const ReferenceImageSchema = z.object({
  id: z.string(),
  filename: z.string(),
  dataUrl: z.string(),
  description: z.string(),
  extractedContext: z.string().optional(),
  createdAt: z.string(),
});

export const SpecSectionSchema = z.object({
  id: z.enum([
    'design-brief',
    'existing-design',
    'research-context',
    'objectives-metrics',
    'design-constraints',
    'design-system',
  ]),
  content: z.string(),
  images: z.array(ReferenceImageSchema),
  lastModified: z.string(),
});

export const InternalContextDocumentSchema = z.object({
  content: z.string(),
  sourceHash: z.string(),
  generatedAt: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  error: z.string().optional(),
});

export const DesignSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  sections: z.record(z.string(), SpecSectionSchema),
  internalContextDocument: InternalContextDocumentSchema.optional(),
  createdAt: z.string(),
  lastModified: z.string(),
  version: z.number(),
});

export interface SpecSectionMeta {
  id: SpecSectionId;
  title: string;
  description: string;
  required: boolean;
}

export type ReferenceImage = z.infer<typeof ReferenceImageSchema>;
export type SpecSection = z.infer<typeof SpecSectionSchema>;
export type InternalContextDocument = z.infer<typeof InternalContextDocumentSchema>;
export type DesignSpec = z.infer<typeof DesignSpecSchema>;
