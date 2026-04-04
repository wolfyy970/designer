import { describe, expect, it, beforeEach } from 'vitest';
import { useSpecStore } from '../spec-store';
import type { ReferenceImage } from '../../types/spec';

const sampleImage: ReferenceImage = {
  id: 'img-1',
  filename: 'a.png',
  dataUrl: 'data:image/png;base64,',
  description: '',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('useSpecStore resetSectionContent', () => {
  beforeEach(() => {
    useSpecStore.getState().createNewCanvas('reset-test');
    useSpecStore.getState().updateSection('design-brief', 'keep other sections untouched');
    useSpecStore.getState().updateSection('research-context', 'to clear');
    useSpecStore.getState().addImage('research-context', sampleImage);
  });

  it('clears content and images for the target section only', () => {
    useSpecStore.getState().resetSectionContent('research-context');

    const state = useSpecStore.getState().spec.sections;
    expect(state['research-context'].content).toBe('');
    expect(state['research-context'].images).toEqual([]);
    expect(state['design-brief'].content).toBe('keep other sections untouched');
  });

  it('updates the cleared section lastModified', () => {
    const sectionBefore = useSpecStore.getState().spec.sections['research-context'];
    useSpecStore.getState().resetSectionContent('research-context');
    const sectionAfter = useSpecStore.getState().spec.sections['research-context'];
    expect(sectionAfter.lastModified).not.toBe(sectionBefore.lastModified);
  });
});
