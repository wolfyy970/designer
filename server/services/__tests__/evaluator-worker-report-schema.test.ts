import { describe, expect, it } from 'vitest';
import {
  evaluatorWorkerReportSchema,
  parseModelJsonObject,
} from '../evaluator-worker-dispatch.ts';
import { evaluatorWorkerReportSchema as sharedSchema } from '../../../src/lib/evaluator-rubric-zod.ts';

/**
 * The worker-report wire shape used to be declared three times with different
 * field sets. The copy in `evaluator-worker-dispatch.ts` — the one that parses
 * the LLM's own response — was missing `rawTrace` and had no `.passthrough()`,
 * so a payload carrying `rawTrace` had that field silently stripped. These pin
 * the consolidated schema and that specific regression.
 */
describe('evaluatorWorkerReportSchema', () => {
  const payload = {
    rubric: 'design',
    scores: { hierarchy: { score: 4, notes: 'clear' } },
    findings: [{ severity: 'low', summary: 's', detail: 'd' }],
    hardFails: [{ code: 'C', message: 'm' }],
  };

  it('is the same object the SSE side validates with', () => {
    // One declaration, not two that happen to agree today.
    expect(evaluatorWorkerReportSchema).toBe(sharedSchema);
  });

  it('preserves rawTrace through the real dispatch parse path', () => {
    // The worker writes rawTrace into the rendered response, but it must not be
    // persisted to client localStorage — `generation-store` partialize removes
    // it. The schema must keep it so the in-memory report has it.
    //
    // Asserted on the schema's own output, NOT via `parseModelJsonObject<T>`:
    // that helper returns its generic parameter, so a type argument would let
    // this pass even if the schema dropped the field entirely.
    const parsed: unknown = parseModelJsonObject(
      `prose before ${JSON.stringify({ ...payload, rawTrace: 'reasoning text' })}`,
      evaluatorWorkerReportSchema,
    );
    expect(parsed).toHaveProperty('rawTrace', 'reasoning text');
  });

  it('forwards undeclared keys, which is what originally protected the field', () => {
    // The actual defect was the *absence* of `.passthrough()` on the dispatching
    // copy: a strict schema drops `rawTrace` even if it is not declared. This
    // assertion is what fails if `.passthrough()` is ever removed.
    const parsed = evaluatorWorkerReportSchema.parse({ ...payload, rawTrace: 'kept' });
    expect(parsed).toHaveProperty('rawTrace', 'kept');
  });

  it('rejects a payload with an unknown rubric', () => {
    const result = evaluatorWorkerReportSchema.safeParse({ ...payload, rubric: 'nope' });
    expect(result.success).toBe(false);
  });

  it('accepts every declared rubric', () => {
    for (const rubric of ['design', 'strategy', 'implementation', 'browser'] as const) {
      expect(evaluatorWorkerReportSchema.safeParse({ ...payload, rubric }).success).toBe(true);
    }
  });

  it('accepts the optional playwrightSkipped and artifacts members', () => {
    const result = evaluatorWorkerReportSchema.safeParse({
      ...payload,
      playwrightSkipped: { reason: 'browser_unavailable', message: 'no chromium' },
      artifacts: { browserScreenshot: { mediaType: 'image/jpeg', base64: 'AAA' } },
    });
    expect(result.success).toBe(true);
  });
});
