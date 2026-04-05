/**
 * Locks the contract between (1) promotion preflight, (2) new-session baseline eval, and (3) proposer context:
 *
 * - **Preflight** compares a *prior* session’s winning `prompt-overrides.json` to `GET /api/prompts/:key`.
 *   When you promote + `pnpm langfuse:sync-prompts`, live bodies match → `scanUnpromotedSessions` returns null.
 *
 * - **Baseline (candidate-0)** always sends **no** harness `promptOverrides` on `/api/*`, so compile/generate
 *   use **only** the running server’s prompts—never the old winner JSON. Unpromoted drift does not “carry
 *   over” into the new session’s baseline.
 *
 * - **Proposer** preloads prompt bodies via the same API (no candidate merge on the first turn), so its
 *   “current bodies” block stays aligned with what baseline evaluation uses when the API is healthy.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ARTIFACT, META_HARNESS_BASELINE_PROMPT_OVERRIDES } from '../constants.ts';
import { loadPromptBodies } from '../proposer-context.ts';
import { scanUnpromotedSessions } from '../preflight-promotion-check.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  hydrateCompileRequestFromParsed,
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
    const body = hydrateCompileRequestFromParsed(parsed, {
      compileProvider: 'openrouter',
      compileModel: 'a/b',
      promptOverrides: { ...META_HARNESS_BASELINE_PROMPT_OVERRIDES },
    });
    expect('promptOverrides' in body).toBe(false);
  });

  it('hypothesis POST body omits promptOverrides for baseline-shaped hydration', () => {
    const parsed = SimplifiedMetaHarnessTestCaseSchema.parse(minimalCase);
    const body = hydrateMetaHarnessTestCaseFromParsed(parsed, {
      defaultCompilerProvider: 'openrouter',
      promptOverrides: { ...META_HARNESS_BASELINE_PROMPT_OVERRIDES },
    });
    expect('promptOverrides' in body).toBe(false);
  });

  it('proposer loadPromptBodies (no candidate overrides) matches API text like baseline would', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        if (String(url).includes('/prompts/hypotheses-generator-system')) {
          return new Response(JSON.stringify({ body: 'api-body-for-key' }), { status: 200 });
        }
        return new Response(null, { status: 404 });
      }),
    );
    const keys = ['hypotheses-generator-system'] as PromptKey[];
    const block = await loadPromptBodies(keys, 'http://127.0.0.1:3001/api');
    expect(block).toContain('api-body-for-key');
  });

  it('preflight can show stale winner vs API while baseline contract stays API-only', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-contract-'));
    const historyRoot = path.join(root, 'meta-harness', 'history');
    const skillsDir = path.join(root, 'skills');
    await mkdir(skillsDir, { recursive: true });
    const sessionDir = path.join(historyRoot, 'session-old');
    const cand = path.join(sessionDir, 'candidate-1');
    await mkdir(cand, { recursive: true });
    await writeFile(
      path.join(sessionDir, ARTIFACT.bestCandidateJson),
      JSON.stringify({ candidateId: 1, meanScore: 4 }, null, 2),
      'utf8',
    );
    await writeFile(path.join(sessionDir, ARTIFACT.promotionReportMd), '# r\n', 'utf8');
    await writeFile(
      path.join(cand, ARTIFACT.promptOverridesJson),
      JSON.stringify({ 'hypotheses-generator-system': 'winner-text' }, null, 2),
      'utf8',
    );
    await mkdir(path.join(cand, 'skills-snapshot'), { recursive: true });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        if (String(url).includes('/prompts/hypotheses-generator-system')) {
          return new Response(JSON.stringify({ body: 'live-still-old' }), { status: 200 });
        }
        return new Response(null, { status: 404 });
      }),
    );

    const stale = await scanUnpromotedSessions({
      historyRoot,
      repoRoot: root,
      apiBaseUrl: 'http://127.0.0.1:3001/api',
      skillsDir,
    });
    expect(stale).not.toBeNull();
    expect(stale!.stalePrompts.some((p) => p.winnerBody === 'winner-text')).toBe(true);

    // Baseline for a *new* session would still use META_HARNESS_BASELINE_PROMPT_OVERRIDES → live-still-old
    // from the API inside eval, not winner-text from disk.
    expect(Object.keys(META_HARNESS_BASELINE_PROMPT_OVERRIDES)).toHaveLength(0);
  });
});
