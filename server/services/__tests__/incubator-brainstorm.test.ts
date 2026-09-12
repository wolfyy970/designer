/**
 * Behavior tests for the optional brainstorm + curation prelude that runs
 * before the incubator stage when `promptOptions.brainstormFirst === true`.
 *
 * Mocks the Pi session at the boundary (`runTaskAgentPiSession`) so the
 * test exercises the prelude's orchestration without standing up a real
 * agent runtime. The two prompt keys (`incubator-brainstorm-system` and
 * `incubator-curation-system`) are also mocked at `getPromptBody` so the
 * test doesn't depend on bundled prompt content.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_MODEL_ID } from '../../../src/test-support/model-fixtures';

vi.mock('../prompt-resolution.ts', () => ({
  getPromptBody: vi.fn(async (key: string) => `GUIDANCE[${key}]`),
}));

vi.mock('../../services/task-agent-session.ts', () => ({
  runTaskAgentPiSession: vi.fn(),
}));

import { runBrainstormPrelude } from '../incubator-brainstorm.ts';
import { runTaskAgentPiSession } from '../task-agent-session.ts';

const baseInput = {
  designBrief: 'Design an app for people in active grief.',
  providerId: 'openrouter',
  modelId: DEFAULT_MODEL_ID,
  correlationId: 'corr-1',
};

/**
 * Build a fake `TaskAgentPiSessionOutput` whose `sessionResult.files`
 * contains a single `result.md` entry — matches what the real Pi session
 * returns when the agent writes to the canonical result file.
 */
function sessionWithResultMd(content: string) {
  return {
    sessionResult: {
      files: { 'result.md': content },
      // The rest of the runtime fields are unused by the prelude; cast
      // narrowly to keep the mock honest about its surface area.
    } as unknown as Awaited<ReturnType<typeof runTaskAgentPiSession>>['sessionResult'],
    skillKeys: [],
  };
}

describe('runBrainstormPrelude', () => {
  beforeEach(() => {
    vi.mocked(runTaskAgentPiSession).mockReset();
  });

  it('stitches the curated directions into the brief as <product_shape_candidates>', async () => {
    vi.mocked(runTaskAgentPiSession)
      .mockResolvedValueOnce(sessionWithResultMd('## Wild Direction A\nFirst direction.'))
      .mockResolvedValueOnce(sessionWithResultMd('## Picked A\nKept for spread.\n\n## Spread rationale\nWhy these 5.'));

    const result = await runBrainstormPrelude(baseInput);

    expect(result.curatedText).toContain('## Picked A');
    expect(result.augmentedBrief).toContain(baseInput.designBrief.trim());
    expect(result.augmentedBrief).toContain('<product_shape_candidates>');
    expect(result.augmentedBrief).toContain('## Picked A');
    expect(result.augmentedBrief).toMatch(/<product_shape_candidates>[\s\S]+<\/product_shape_candidates>/);
    expect(runTaskAgentPiSession).toHaveBeenCalledTimes(2);
  });

  it('passes the brainstorm output into the curation prompt body so curation sees the brainstorm pool', async () => {
    vi.mocked(runTaskAgentPiSession)
      .mockResolvedValueOnce(sessionWithResultMd('## Direction Alpha'))
      .mockResolvedValueOnce(sessionWithResultMd('## Picked Alpha'));

    await runBrainstormPrelude(baseInput);

    // First call = brainstorm; second call = curation. The curation
    // prompt body must contain the brainstorm output wrapped in
    // <brainstorm_directions>…</brainstorm_directions> so the model sees
    // exactly what it's narrowing.
    const [, curationCall] = vi.mocked(runTaskAgentPiSession).mock.calls;
    expect(curationCall[0].userPrompt).toContain('## Direction Alpha');
    expect(curationCall[0].userPrompt).toContain('<brainstorm_directions>');
  });

  it('throws when the design brief is empty (no point running an LLM call)', async () => {
    await expect(
      runBrainstormPrelude({ ...baseInput, designBrief: '   \n\t  ' }),
    ).rejects.toThrow(/non-empty design brief/);
    expect(runTaskAgentPiSession).not.toHaveBeenCalled();
  });

  it('throws when the brainstorm session returns a null sessionResult (stream-idle abort path)', async () => {
    vi.mocked(runTaskAgentPiSession).mockResolvedValueOnce({
      sessionResult: null as unknown as Awaited<ReturnType<typeof runTaskAgentPiSession>>['sessionResult'],
      skillKeys: [],
    });
    await expect(runBrainstormPrelude(baseInput)).rejects.toThrow(/brainstorm.*session/i);
  });

  it('throws when the brainstorm produced an empty result.md (model wrote no file)', async () => {
    vi.mocked(runTaskAgentPiSession)
      .mockResolvedValueOnce(sessionWithResultMd(''))
      .mockResolvedValueOnce(sessionWithResultMd('## Picked'));
    await expect(runBrainstormPrelude(baseInput)).rejects.toThrow(/brainstorm.*no result/i);
  });

  it('throws when the curation session returns a null sessionResult', async () => {
    vi.mocked(runTaskAgentPiSession)
      .mockResolvedValueOnce(sessionWithResultMd('## Wild'))
      .mockResolvedValueOnce({
        sessionResult: null as unknown as Awaited<ReturnType<typeof runTaskAgentPiSession>>['sessionResult'],
        skillKeys: [],
      });
    await expect(runBrainstormPrelude(baseInput)).rejects.toThrow(/curation.*session/i);
  });
});
