/**
 * Hermetic tests for runHypothesisEvalFromMetaHarness (fetch + SSE + score merge).
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import type { MetaHarnessHypothesisGenerateBody } from '../test-case-hydrator.ts';
import { runHypothesisEvalFromMetaHarness } from '../evaluator.ts';
import { ARTIFACT } from '../constants.ts';

const CORR = 'mh-unit-corr';
/** Default harness waits 60s for meta.json; internal `waitForMetaJson` is not spyable from tests (binding). */
const SHORT_META_WAIT_MS = 200;

function minimalBody(): MetaHarnessHypothesisGenerateBody {
  return { correlationId: CORR } as MetaHarnessHypothesisGenerateBody;
}

function sseLines(...events: Array<{ ev: string; data: unknown }>): string {
  return events
    .map(({ ev, data }) => `event: ${ev}\ndata: ${JSON.stringify(data)}\n`)
    .join('');
}

describe('runHypothesisEvalFromMetaHarness', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns HTTP error details when POST is not OK', async () => {
    fetchMock.mockResolvedValue(
      new Response('bad gateway', { status: 502, statusText: 'Bad Gateway' }),
    );

    const r = await runHypothesisEvalFromMetaHarness({
      apiBaseUrl: 'http://127.0.0.1:4731/api',
      body: minimalBody(),
      evalRunsBaseDir: tmpdir(),
    });

    expect(r.errorMessage).toMatch(/^HTTP 502:/);
    expect(r.evalRunDir).toBeNull();
    expect(r.overallScore).toBeNull();
    expect(r.finalAggregate).toBeNull();
    expect(r.sseErrors).toEqual([]);
  });

  it('returns No response body when body is missing', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const r = await runHypothesisEvalFromMetaHarness({
      apiBaseUrl: 'http://127.0.0.1:4731/api',
      body: minimalBody(),
      evalRunsBaseDir: tmpdir(),
    });

    expect(r.errorMessage).toBe('No response body');
    expect(r.evalRunDir).toBeNull();
  });

  it('records SSE error event in errorMessage and sseErrors', async () => {
    const sse = sseLines({ ev: SSE_EVENT_NAMES.error, data: { error: 'lane_failed' } });
    fetchMock.mockResolvedValue(
      new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );

    const r = await runHypothesisEvalFromMetaHarness({
      apiBaseUrl: 'http://127.0.0.1:4731/api',
      body: minimalBody(),
      evalRunsBaseDir: tmpdir(),
      evalLogWaitMs: SHORT_META_WAIT_MS,
    });

    expect(r.errorMessage).toBe('lane_failed');
    expect(r.sseErrors).toContain('lane_failed');
  });

  it('ignores evaluation_report aggregate that fails harness schema', async () => {
    const sse = sseLines({
      ev: SSE_EVENT_NAMES.evaluation_report,
      data: { snapshot: { aggregate: {} } },
    });
    fetchMock.mockResolvedValue(
      new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );

    const r = await runHypothesisEvalFromMetaHarness({
      apiBaseUrl: 'http://127.0.0.1:4731/api',
      body: minimalBody(),
      evalRunsBaseDir: tmpdir(),
      evalLogWaitMs: SHORT_META_WAIT_MS,
    });

    expect(r.finalAggregate).toBeNull();
    expect(r.overallScore).toBeNull();
  });

  it('accepts valid evaluation_report aggregate and overallScore when meta.json is absent', async () => {
    const sse = sseLines({
      ev: SSE_EVENT_NAMES.evaluation_report,
      data: {
        snapshot: { aggregate: { overallScore: 4.25, revisionBrief: 'ok' } },
      },
    });
    fetchMock.mockResolvedValue(
      new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );

    const r = await runHypothesisEvalFromMetaHarness({
      apiBaseUrl: 'http://127.0.0.1:4731/api',
      body: minimalBody(),
      evalRunsBaseDir: tmpdir(),
      evalLogWaitMs: SHORT_META_WAIT_MS,
    });

    expect(r.evalRunDir).toBeNull();
    expect(r.overallScore).toBe(4.25);
    expect(r.finalAggregate?.overallScore).toBe(4.25);
  });

  it('prefers SSE aggregate overallScore over disk meta.json when both exist', async () => {
    const baseDir = path.join(tmpdir(), `mh-eval-${Date.now()}`);
    await mkdir(baseDir, { recursive: true });
    const laneDir = path.join(baseDir, 'eval-runs', `${CORR}:lane-0`);
    await mkdir(laneDir, { recursive: true });
    await writeFile(
      path.join(laneDir, ARTIFACT.metaJson),
      JSON.stringify({ finalOverallScore: 9.99, stopReason: 'disk' }),
      'utf8',
    );

    const sse = sseLines({
      ev: SSE_EVENT_NAMES.evaluation_report,
      data: { snapshot: { aggregate: { overallScore: 3.5 } } },
    });
    fetchMock.mockResolvedValue(
      new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );

    const r = await runHypothesisEvalFromMetaHarness({
      apiBaseUrl: 'http://127.0.0.1:4731/api',
      body: minimalBody(),
      evalRunsBaseDir: baseDir,
      evalLogWaitMs: SHORT_META_WAIT_MS,
    });

    expect(r.overallScore).toBe(3.5);
    expect(r.evalRunDir).toBe(laneDir);
    await rm(baseDir, { recursive: true, force: true });
  });

  it('uses disk score when stream has no valid aggregate', async () => {
    const baseDir = path.join(tmpdir(), `mh-eval-disk-${Date.now()}`);
    await mkdir(baseDir, { recursive: true });
    const laneDir = path.join(baseDir, 'eval-runs', `${CORR}:lane-0`);
    await mkdir(laneDir, { recursive: true });
    await writeFile(
      path.join(laneDir, ARTIFACT.metaJson),
      JSON.stringify({ finalOverallScore: 7.2, stopReason: 'satisfied' }),
      'utf8',
    );

    const sse = sseLines({
      ev: SSE_EVENT_NAMES.progress,
      data: { message: 'tick' },
    });
    fetchMock.mockResolvedValue(
      new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );

    const r = await runHypothesisEvalFromMetaHarness({
      apiBaseUrl: 'http://127.0.0.1:4731/api',
      body: minimalBody(),
      evalRunsBaseDir: baseDir,
      evalLogWaitMs: SHORT_META_WAIT_MS,
    });

    expect(r.overallScore).toBe(7.2);
    expect(r.stopReason).toBe('satisfied');
    await rm(baseDir, { recursive: true, force: true });
  });

  it('checkpoint updates finalAggregate and stopReason', async () => {
    const sse = sseLines({
      ev: SSE_EVENT_NAMES.checkpoint,
      data: {
        stopReason: 'max_revisions',
        aggregate: { overallScore: 1.5, revisionBrief: 'stop' },
      },
    });
    fetchMock.mockResolvedValue(
      new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );

    const r = await runHypothesisEvalFromMetaHarness({
      apiBaseUrl: 'http://127.0.0.1:4731/api',
      body: minimalBody(),
      evalRunsBaseDir: tmpdir(),
      evalLogWaitMs: SHORT_META_WAIT_MS,
    });

    expect(r.stopReason).toBe('max_revisions');
    expect(r.overallScore).toBe(1.5);
    expect(r.finalAggregate?.overallScore).toBe(1.5);
  });

  it('strips laneIndex from wire payload before evaluation_report handling', async () => {
    const sse = sseLines({
      ev: SSE_EVENT_NAMES.evaluation_report,
      data: {
        laneIndex: 0,
        snapshot: { aggregate: { overallScore: 2.25 } },
      },
    });
    fetchMock.mockResolvedValue(
      new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );
    const onWire = vi.fn();
    await runHypothesisEvalFromMetaHarness({
      apiBaseUrl: 'http://127.0.0.1:4731/api',
      body: minimalBody(),
      evalRunsBaseDir: tmpdir(),
      evalLogWaitMs: SHORT_META_WAIT_MS,
      onWireEvent: onWire,
    });
    const payload = onWire.mock.calls.find((c) => c[0] === SSE_EVENT_NAMES.evaluation_report)?.[1] as Record<
      string,
      unknown
    >;
    expect(payload).toBeDefined();
    expect('laneIndex' in (payload as object)).toBe(false);
    expect((payload as { snapshot?: unknown }).snapshot).toBeDefined();
  });

  it('invokes onWireEvent for non-terminal events', async () => {
    const onWire = vi.fn();
    const sse = sseLines(
      { ev: SSE_EVENT_NAMES.progress, data: { step: 1 } },
      { ev: SSE_EVENT_NAMES.done, data: {} },
    );
    fetchMock.mockResolvedValue(
      new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );

    await runHypothesisEvalFromMetaHarness({
      apiBaseUrl: 'http://127.0.0.1:4731/api',
      body: minimalBody(),
      evalRunsBaseDir: tmpdir(),
      evalLogWaitMs: SHORT_META_WAIT_MS,
      onWireEvent: onWire,
    });

    expect(onWire).toHaveBeenCalled();
    const names = onWire.mock.calls.map((c) => c[0]);
    expect(names).toContain(SSE_EVENT_NAMES.progress);
    expect(names).toContain(SSE_EVENT_NAMES.done);
  });
});
