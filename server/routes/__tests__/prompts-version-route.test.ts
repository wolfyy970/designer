import { Hono } from 'hono';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../db/prompts.ts', () => ({
  getPromptVersionBody: vi.fn(),
}));

import { getPromptVersionBody } from '../../db/prompts.ts';
import prompts from '../prompts.ts';

const getVersionBody = vi.mocked(getPromptVersionBody);

describe('GET /api/prompts/:key/versions/:versionNum', () => {
  const app = new Hono().basePath('/api').route('/prompts', prompts);

  beforeEach(() => {
    getVersionBody.mockReset();
  });

  it('returns body for existing version', async () => {
    getVersionBody.mockResolvedValue({
      body: 'hello',
      createdAt: '2024-01-02T00:00:00.000Z',
    });
    const res = await app.request('http://localhost/api/prompts/compilerSystem/versions/2');
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({
      key: 'compilerSystem',
      version: 2,
      body: 'hello',
      createdAt: '2024-01-02T00:00:00.000Z',
    });
  });

  it('returns 404 when version row is missing', async () => {
    getVersionBody.mockResolvedValue(null);
    const res = await app.request('http://localhost/api/prompts/compilerSystem/versions/99');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid version and does not query backend', async () => {
    const res = await app.request('http://localhost/api/prompts/compilerSystem/versions/0');
    expect(res.status).toBe(400);
    expect(getVersionBody).not.toHaveBeenCalled();
  });
});
