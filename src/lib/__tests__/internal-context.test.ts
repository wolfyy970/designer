import { describe, it, expect } from 'vitest';
import type { DesignSpec, ReferenceImage, SpecSection, SpecSectionId } from '../../types/spec';
import {
  buildInternalContextUserMessage,
  computeInternalContextSourceHash,
  isInternalContextDocumentStale,
} from '../internal-context';

function section(id: SpecSectionId, content = '', images: ReferenceImage[] = []): SpecSection {
  return { id, content, images, lastModified: '2026-01-01T00:00:00Z' };
}

function spec(patch: Partial<DesignSpec> = {}): DesignSpec {
  return {
    id: 's1',
    title: 'Checkout redesign',
    sections: {
      'design-brief': section('design-brief', 'Brief'),
      'existing-design': section('existing-design'),
      'research-context': section('research-context'),
      'objectives-metrics': section('objectives-metrics'),
      'design-constraints': section('design-constraints'),
      'design-system': section('design-system', 'Tokens should not affect source hash'),
    },
    createdAt: '2026-01-01T00:00:00Z',
    lastModified: '2026-01-01T00:00:00Z',
    version: 1,
    ...patch,
  };
}

describe('internal context helpers', () => {
  it('changes hash when a source input changes', () => {
    const a = spec();
    const b = spec({
      sections: {
        ...a.sections,
        'research-context': section('research-context', 'Users compare plans'),
      },
    });
    expect(computeInternalContextSourceHash(a)).not.toBe(computeInternalContextSourceHash(b));
  });

  it('ignores unrelated generated document and legacy design-system section changes', () => {
    const a = spec();
    const b = spec({
      internalContextDocument: {
        content: 'Derived',
        sourceHash: 'old',
        generatedAt: '2026-01-02T00:00:00Z',
        providerId: 'p',
        modelId: 'm',
      },
      sections: {
        ...a.sections,
        'design-system': section('design-system', 'Different legacy DS text'),
      },
    });
    expect(computeInternalContextSourceHash(a)).toBe(computeInternalContextSourceHash(b));
  });

  it('changes hash when active reference image metadata or content changes', () => {
    const img: ReferenceImage = {
      id: 'img1',
      filename: 'screen.png',
      dataUrl: 'data:image/png;base64,aaa',
      description: 'Screen',
      createdAt: '2026-01-01T00:00:00Z',
    };
    const a = spec({
      sections: { ...spec().sections, 'research-context': section('research-context', '', [img]) },
    });
    const b = spec({
      sections: {
        ...spec().sections,
        'research-context': section('research-context', '', [{ ...img, dataUrl: 'data:image/png;base64,bbb' }]),
      },
    });
    expect(computeInternalContextSourceHash(a)).not.toBe(computeInternalContextSourceHash(b));
  });

  it('ignores retired legacy existing-design content and images', () => {
    const img: ReferenceImage = {
      id: 'img1',
      filename: 'screen.png',
      dataUrl: 'data:image/png;base64,aaa',
      description: 'Screen',
      createdAt: '2026-01-01T00:00:00Z',
    };
    const a = spec();
    const b = spec({
      sections: {
        ...a.sections,
        'existing-design': section('existing-design', 'Old checkout', [img]),
      },
    });
    expect(computeInternalContextSourceHash(a)).toBe(computeInternalContextSourceHash(b));
  });

  it('detects stale documents by source hash', () => {
    const s = spec();
    const sourceHash = computeInternalContextSourceHash(s);
    expect(
      isInternalContextDocumentStale(s, {
        content: 'Doc',
        sourceHash,
        generatedAt: '2026-01-01T00:00:00Z',
        providerId: 'p',
        modelId: 'm',
      }),
    ).toBe(false);
    expect(
      isInternalContextDocumentStale(s, {
        content: 'Doc',
        sourceHash: 'different',
        generatedAt: '2026-01-01T00:00:00Z',
        providerId: 'p',
        modelId: 'm',
      }),
    ).toBe(true);
  });

  it('builds a user message with supplied sections and reference image summaries', () => {
    const img: ReferenceImage = {
      id: 'img1',
      filename: 'screen.png',
      dataUrl: 'data:image/png;base64,aaa',
      description: 'Current checkout',
      createdAt: '2026-01-01T00:00:00Z',
    };
    const body = buildInternalContextUserMessage(
      spec({
        sections: {
          ...spec().sections,
          'research-context': section('research-context', 'Market notes', [img]),
        },
      }),
    );
    expect(body).toContain('<design_brief>');
    expect(body).toContain('Market notes');
    expect(body).toContain('<reference_images>');
    expect(body).toContain('screen.png');
  });
});
