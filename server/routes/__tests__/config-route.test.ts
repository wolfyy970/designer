import { describe, expect, it } from 'vitest';
import app from '../../app.ts';
import { LOCKDOWN_MODEL_ID, LOCKDOWN_PROVIDER_ID } from '../../../src/lib/lockdown-model.ts';

describe('GET /api/config', () => {
  it('returns lockdown true and pinned model when LOCKDOWN is unset', async () => {
    const prev = process.env.LOCKDOWN;
    delete process.env.LOCKDOWN;
    try {
      const res = await app.request('http://localhost/api/config');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.lockdown).toBe(true);
      expect(body.lockdownProviderId).toBe(LOCKDOWN_PROVIDER_ID);
      expect(body.lockdownModelId).toBe(LOCKDOWN_MODEL_ID);
      expect(typeof body.lockdownModelLabel).toBe('string');
      expect(typeof body.agenticMaxRevisionRounds).toBe('number');
      expect(
        body.agenticMinOverallScore === null || typeof body.agenticMinOverallScore === 'number',
      ).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.LOCKDOWN;
      else process.env.LOCKDOWN = prev;
    }
  });

  it('returns lockdown false when LOCKDOWN=false', async () => {
    const prev = process.env.LOCKDOWN;
    process.env.LOCKDOWN = 'false';
    try {
      const res = await app.request('http://localhost/api/config');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.lockdown).toBe(false);
      expect(typeof (body as Record<string, unknown>).agenticMaxRevisionRounds).toBe('number');
      expect(
        (body as Record<string, unknown>).agenticMinOverallScore === null ||
          typeof (body as Record<string, unknown>).agenticMinOverallScore === 'number',
      ).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.LOCKDOWN;
      else process.env.LOCKDOWN = prev;
    }
  });
});
