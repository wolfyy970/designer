/**
 * REST/JSON API helpers: config, models, prompt bundle, trace.
 */
import type { HypothesisPromptBundleResponse, HypothesisWorkspaceApiPayload, ModelsResponse, ProviderInfo } from './types';
import type { RunTraceEvent } from '../types/provider';
import {
  LOCKDOWN_MODEL_ID,
  LOCKDOWN_MODEL_LABEL,
  LOCKDOWN_PROVIDER_ID,
} from '../lib/lockdown-model';
import { FEATURE_LOCKDOWN, FEATURE_AUTO_IMPROVE } from '../lib/feature-flags';
import { DEFAULT_EVALUATOR_SETTINGS } from '../types/evaluator-settings';
import { DEFAULT_RUBRIC_WEIGHTS } from '../types/evaluation';
import {
  HypothesisPromptBundleResponseSchema,
  ModelsResponseSchema,
  ProvidersListResponseSchema,
  AppConfigResponseSchema,
  type AppConfigResponse,
} from './response-schemas';
import { API_BASE, getParsedList, INVALID_SERVER_RESPONSE, postParsed } from './client-shared.ts';

/** Default client assumption until GET /api/config succeeds — mirrors feature-flags.json defaults. */
export function getPlaceholderAppConfig(): AppConfigResponse {
  const base = {
    agenticMaxRevisionRounds: DEFAULT_EVALUATOR_SETTINGS.maxRevisionRounds,
    agenticMinOverallScore: DEFAULT_EVALUATOR_SETTINGS.minOverallScore,
    defaultRubricWeights: { ...DEFAULT_RUBRIC_WEIGHTS },
    maxConcurrentRuns: 5,
    autoImprove: FEATURE_AUTO_IMPROVE,
  };
  if (!FEATURE_LOCKDOWN) return { lockdown: false, ...base };
  return {
    lockdown: true,
    lockdownProviderId: LOCKDOWN_PROVIDER_ID,
    lockdownModelId: LOCKDOWN_MODEL_ID,
    lockdownModelLabel: LOCKDOWN_MODEL_LABEL,
    ...base,
  };
}

export async function fetchAppConfig(signal?: AbortSignal): Promise<AppConfigResponse> {
  const response = await fetch(`${API_BASE}/config`, { signal });
  if (!response.ok) {
    throw new Error('Failed to load app config');
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(INVALID_SERVER_RESPONSE);
  }
  const r = AppConfigResponseSchema.safeParse(json);
  if (!r.success) {
    if (import.meta.env.DEV) {
      console.warn('[api] GET /config response shape unexpected', r.error.flatten());
    }
    throw new Error(INVALID_SERVER_RESPONSE);
  }
  return r.data;
}

export async function fetchHypothesisPromptBundle(
  body: HypothesisWorkspaceApiPayload,
  signal?: AbortSignal,
): Promise<HypothesisPromptBundleResponse> {
  return postParsed('/hypothesis/prompt-bundle', body, HypothesisPromptBundleResponseSchema, signal);
}

export async function listModels(providerId: string): Promise<ModelsResponse> {
  return getParsedList(`/models/${providerId}`, ModelsResponseSchema, []);
}

export async function listProviders(): Promise<ProviderInfo[]> {
  return getParsedList('/models', ProvidersListResponseSchema, []);
}

/** Forward run-trace events to the server observability ring (best-effort, dev). */
export async function postTraceEvents(body: {
  correlationId?: string;
  resultId?: string;
  events: RunTraceEvent[];
}): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/logs/trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}
