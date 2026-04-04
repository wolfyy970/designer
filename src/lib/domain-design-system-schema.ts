import { z } from 'zod';
import { ReferenceImageSchema } from '../types/spec';

/** Wire validation for `designSystems` values on hypothesis workspace payloads. */
export const DomainDesignSystemContentSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  content: z.string(),
  images: z.array(ReferenceImageSchema),
  providerMigration: z.string().optional(),
  modelMigration: z.string().optional(),
});
