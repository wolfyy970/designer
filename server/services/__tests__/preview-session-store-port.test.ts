import { describe, expect, it } from 'vitest';
import { InMemoryPreviewSessionStore } from '../preview-session-store.ts';

describe('PreviewSessionStore port', () => {
  it('stores, replaces, resolves, and deletes preview files through the interface', () => {
    const store = new InMemoryPreviewSessionStore();
    const id = store.create({ 'index.html': '<h1>One</h1>' });

    expect(store.file(id, 'index.html')).toBe('<h1>One</h1>');
    expect(store.replace(id, { 'index.html': '<h1>Two</h1>' })).toBe(true);
    expect(store.snapshot(id)).toEqual({ 'index.html': '<h1>Two</h1>' });

    store.delete(id);
    expect(store.file(id, 'index.html')).toBeUndefined();
  });
});
