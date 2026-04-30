import { z } from 'zod';
import { ReferenceImageSchema } from '../types/spec';
import { DesignSystemMarkdownSourceSchema } from '../types/design-system-source';

export const DesignMdLintFindingSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
});

export const DesignMdLintSummarySchema = z.object({
  errors: z.number().int().min(0),
  warnings: z.number().int().min(0),
  infos: z.number().int().min(0),
  findings: z.array(DesignMdLintFindingSchema).optional(),
});

export const DesignMdDocumentSchema = z.object({
  content: z.string(),
  sourceHash: z.string(),
  generatedAt: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  lint: DesignMdLintSummarySchema.optional(),
  error: z.string().optional(),
});

/** Wire validation for `designSystems` values on hypothesis workspace payloads. */
export const DomainDesignSystemContentSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  content: z.string(),
  images: z.array(ReferenceImageSchema),
  markdownSources: z.array(DesignSystemMarkdownSourceSchema).optional(),
  designMdDocument: DesignMdDocumentSchema.optional(),
  providerMigration: z.string().optional(),
  modelMigration: z.string().optional(),
});
