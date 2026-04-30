import { z } from 'zod';

export const DesignSystemMarkdownSourceSchema = z.object({
  id: z.string(),
  filename: z.string(),
  content: z.string(),
  sizeBytes: z.number().int().min(0),
  createdAt: z.string(),
});

export type DesignSystemMarkdownSource = z.infer<typeof DesignSystemMarkdownSourceSchema>;
