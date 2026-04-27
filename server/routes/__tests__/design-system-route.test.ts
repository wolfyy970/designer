import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/task-agent-execution.ts', () => ({
  executeTaskAgentStream: vi.fn(async () => ({ result: '---\nname: Test\n---\n# Test\n', resultFile: 'DESIGN.md', files: {} })),
}));

vi.mock('../../lib/design-md-lint.ts', () => ({
  lintDesignMdDocument: vi.fn(async () => ({ errors: 0, warnings: 0, infos: 0, findings: [] })),
}));

import app from '../../app.ts';
import { executeTaskAgentStream } from '../../services/task-agent-execution.ts';
import { lintDesignMdDocument } from '../../lib/design-md-lint.ts';

const minimalBody = {
  images: [{ dataUrl: 'data:image/png;base64,AAAA' }],
  providerId: 'openrouter',
  modelId: 'minimax/minimax-m2.5',
};

describe('POST /api/design-system/extract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when providerId is empty', async () => {
    const res = await app.request('http://localhost/api/design-system/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...minimalBody, providerId: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when images is not an array', async () => {
    const res = await app.request('http://localhost/api/design-system/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...minimalBody, images: 'not-array' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when text and images are both absent', async () => {
    const res = await app.request('http://localhost/api/design-system/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'openrouter', modelId: 'minimax/minimax-m2.5' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns SSE stream for valid image-only request and writes DESIGN.md', async () => {
    const res = await app.request('http://localhost/api/design-system/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minimalBody),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(executeTaskAgentStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionType: 'design-system',
        resultFile: 'DESIGN.md',
      }),
      expect.anything(),
    );
  });

  it('accepts text-only requests', async () => {
    const res = await app.request('http://localhost/api/design-system/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Brand',
        content: 'Use red buttons.',
        providerId: 'openrouter',
        modelId: 'minimax/minimax-m2.5',
      }),
    });
    expect(res.status).toBe(200);
  });

  it('prompts the agent with the exact Google DESIGN.md contract', async () => {
    const res = await app.request('http://localhost/api/design-system/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Brand',
        content: 'Use red buttons.',
        providerId: 'openrouter',
        modelId: 'minimax/minimax-m2.5',
      }),
    });
    expect(res.status).toBe(200);
    const taskOptions = vi.mocked(executeTaskAgentStream).mock.calls.at(-1)?.[1];
    expect(taskOptions?.userPrompt).toContain(
      'version, name, description, colors, typography, rounded, spacing, components',
    );
    expect(taskOptions?.userPrompt).toContain('Use `rounded`, not `radius`');
    expect(taskOptions?.userPrompt).toContain('Include every official YAML token group');
    expect(taskOptions?.userPrompt).toContain('Include every official Markdown section');
    expect(taskOptions?.userPrompt).toContain('infer a complete, coherent design system');
    expect(taskOptions?.userPrompt).toContain(
      "Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts",
    );
  });

  it('fails the stream when DESIGN.md lint returns errors', async () => {
    vi.mocked(lintDesignMdDocument).mockResolvedValueOnce({
      errors: 1,
      warnings: 0,
      infos: 0,
      findings: [{ severity: 'error', message: 'bad yaml' }],
    });
    const res = await app.request('http://localhost/api/design-system/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minimalBody),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('failed lint');
  });
});
