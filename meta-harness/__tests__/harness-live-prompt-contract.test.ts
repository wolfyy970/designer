/**
 * Locks the contract between (1) promotion preflight, (2) new-session baseline eval, and (3) proposer context:
 *
 * - **Preflight** compares a *prior* session's winning skill snapshots and rubric weights
 *   against the repo. Prompt overrides are legacy (no longer compared via API).
 *
 * - **Baseline (candidate-0)** always sends **no** harness `promptOverrides` on `/api/*`, so compile/generate
 *   use **only** the running server's prompts—never the old winner JSON.
 *
 * - **Proposer** preloads prompt bodies from disk (skills + PROMPT.md), so its
 *   "current bodies" block stays aligned with what baseline evaluation uses.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { META_HARNESS_BASELINE_PROMPT_OVERRIDES } from '../constants.ts';
import { loadPromptBodies } from '../proposer-context.ts';
import {
  hydrateIncubateRequestFromParsed,
  hydrateMetaHarnessTestCaseFromParsed,
  SimplifiedMetaHarnessTestCaseSchema,
} from '../test-case-hydrator.ts';
import type { PromptKey } from '../../src/lib/prompts/defaults.ts';

const minimalCase = {
  name: 'contract-case',
  spec: {
    title: 'T',
    sections: {
      'design-brief': 'b',
      'existing-design': '',
      'research-context': '',
      'objectives-metrics': '',
      'design-constraints': '',
    },
  },
  strategy: {
    id: 's',
    name: 'S',
    hypothesis: 'h',
    rationale: 'r',
    measurements: 'm',
    dimensionValues: { format: 'html' },
  },
  model: { providerId: 'openrouter', modelId: 'x/y' },
};

describe('harness live prompt contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('baseline uses empty harness promptOverrides (never a prior winner snapshot)', () => {
    expect(Object.keys(META_HARNESS_BASELINE_PROMPT_OVERRIDES)).toHaveLength(0);
  });

  it('compile POST body omits promptOverrides for baseline-shaped hydration', () => {
    const parsed = SimplifiedMetaHarnessTestCaseSchema.parse(minimalCase);
    const body = hydrateIncubateRequestFromParsed(parsed, {
      incubateProvider: 'openrouter',
      incubateModel: 'a/b',
      promptOverrides: { ...META_HARNESS_BASELINE_PROMPT_OVERRIDES },
    });
    expect('promptOverrides' in body).toBe(false);
  });

  it('hypothesis POST body omits promptOverrides for baseline-shaped hydration', () => {
    const parsed = SimplifiedMetaHarnessTestCaseSchema.parse(minimalCase);
    const body = hydrateMetaHarnessTestCaseFromParsed(parsed, {
      defaultIncubatorProvider: 'openrouter',
      promptOverrides: { ...META_HARNESS_BASELINE_PROMPT_OVERRIDES },
    });
    expect('promptOverrides' in body).toBe(false);
  });

  it('proposer loadPromptBodies reads from disk skills (not API)', async () => {
    const keys = ['hypotheses-generator-system'] as PromptKey[];
    const block = await loadPromptBodies(keys, 'http://127.0.0.1:3001/api');
    expect(block).toContain('hypotheses-generator-system');
    expect(block).toContain('Current prompt bodies');
  });

  it('proposer loadPromptBodies prefers overrides over disk', async () => {
    const keys = ['hypotheses-generator-system'] as PromptKey[];
    const block = await loadPromptBodies(keys, 'http://unused', {
      'hypotheses-generator-system': 'override-body',
    });
    expect(block).toContain('override-body');
  });
});
