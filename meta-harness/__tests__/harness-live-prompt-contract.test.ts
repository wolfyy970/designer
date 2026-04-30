/**
 * Locks the contract between (1) promotion preflight, (2) new-session baseline eval, and (3) proposer context:
 *
 * - **Preflight** compares a *prior* session's winning skill snapshots and rubric weights against the repo.
 *
 * - **API requests** never include legacy `promptOverrides` — incubate / hypothesis bodies are schema-clean.
 *
 * - **Proposer** preloads prompt bodies from disk (`skills` + `PROMPT.md` via `getPromptBody`), aligned with evaluation.
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

  it('legacy baseline constant stays empty (artifact compatibility only)', () => {
    expect(Object.keys(META_HARNESS_BASELINE_PROMPT_OVERRIDES)).toHaveLength(0);
  });

  it('compile POST body omits promptOverrides', () => {
    const parsed = SimplifiedMetaHarnessTestCaseSchema.parse(minimalCase);
    const body = hydrateIncubateRequestFromParsed(parsed, {
      incubateProvider: 'openrouter',
      incubateModel: 'a/b',
    });
    expect('promptOverrides' in body).toBe(false);
  });

  it('hypothesis POST body omits promptOverrides', () => {
    const parsed = SimplifiedMetaHarnessTestCaseSchema.parse(minimalCase);
    const body = hydrateMetaHarnessTestCaseFromParsed(parsed, {
      defaultIncubatorProvider: 'openrouter',
    });
    expect('promptOverrides' in body).toBe(false);
  });

  it('proposer loadPromptBodies reads from disk skills', async () => {
    const keys = ['hypotheses-generator-system'] as PromptKey[];
    const block = await loadPromptBodies(keys);
    expect(block).toContain('hypotheses-generator-system');
    expect(block).toContain('Current prompt bodies');
  });
});
