import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { mockKeys } = vi.hoisted(() => ({
  mockKeys: vi.fn(),
}));

vi.mock('idb-keyval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('idb-keyval')>();
  return {
    ...actual,
    keys: mockKeys,
  };
});

import { migrateLegacyStoragePrefixes } from '../migration';

const FLAG = 'auto-designer-legacy-prefix-migrated-v1';

describe('migrateLegacyStoragePrefixes', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    mockKeys.mockReset();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of Object.keys(store)) delete store[k];
  });

  it('does not set migration flag when idb migration fails', async () => {
    mockKeys.mockRejectedValue(new Error('idb'));
    await migrateLegacyStoragePrefixes();
    expect(store[FLAG]).toBeUndefined();
  });

  it('sets flag when migration completes', async () => {
    mockKeys.mockResolvedValue([]);
    await migrateLegacyStoragePrefixes();
    expect(store[FLAG]).toBe('1');
  });
});
