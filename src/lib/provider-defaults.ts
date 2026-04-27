/**
 * Provider / model defaults — shared by client and server.
 * Values live in config/provider-defaults.json. Only consulted when lockdown is off;
 * lockdown mode ignores these and uses the pinned provider/model in lockdown-model.ts.
 * Validated by Zod at module load; a bad value fails fast with a readable error.
 */
import { z } from 'zod';
import rawDefaults from '../../config/provider-defaults.json';

export const ProviderDefaultsFileSchema = z
  .object({
    compilerProvider: z.enum(['openrouter', 'lmstudio']),
    modelId:          z.string().min(1),
  })
  .strict();

export type ProviderDefaults = z.infer<typeof ProviderDefaultsFileSchema>;

const DEFAULTS = ProviderDefaultsFileSchema.parse(rawDefaults);

/** Provider preselected for auto-created Model nodes (incubator / hypothesis workspace). */
export const DEFAULT_COMPILER_PROVIDER = DEFAULTS.compilerProvider;

/** OpenRouter model slug preselected for auto-created Model nodes. */
export const DEFAULT_MODEL_ID = DEFAULTS.modelId;
