import type { DesignSpec, InternalContextDocument, SpecSectionId } from '../types/spec';
import { hashDocumentSource, imageFingerprint } from './document-fingerprint';

const SOURCE_SECTION_IDS: SpecSectionId[] = [
  'design-brief',
  'research-context',
  'objectives-metrics',
  'design-constraints',
];

export function internalContextSourcePayload(spec: DesignSpec): unknown {
  return {
    title: spec.title,
    sections: SOURCE_SECTION_IDS.map((sectionId) => {
      const section = spec.sections[sectionId];
      return {
        id: sectionId,
        content: section?.content ?? '',
        images: (section?.images ?? []).map(imageFingerprint),
      };
    }),
  };
}

export function computeInternalContextSourceHash(spec: DesignSpec): string {
  return hashDocumentSource(internalContextSourcePayload(spec));
}

export function isInternalContextDocumentStale(
  spec: DesignSpec,
  doc: InternalContextDocument | undefined = spec.internalContextDocument,
): boolean {
  if (!doc) return true;
  return doc.sourceHash !== computeInternalContextSourceHash(spec);
}

export type InternalContextStatus =
  | 'missing'
  | 'ready-to-generate'
  | 'generating'
  | 'ready'
  | 'needs-update'
  | 'error';

export interface InternalContextUiState {
  status: InternalContextStatus;
  statusLabel?: string;
  canView: boolean;
  canGenerate: boolean;
  actionLabel?: string;
}

export function hasInternalContextSourceInput(spec: DesignSpec): boolean {
  return Boolean(spec.sections['design-brief']?.content?.trim());
}

export function getInternalContextUiState(
  spec: DesignSpec,
  options: {
    generating?: boolean;
    document?: InternalContextDocument;
  } = {},
): InternalContextUiState {
  const doc = options.document ?? spec.internalContextDocument;
  const canView = Boolean(doc?.content?.trim());
  const hasSource = hasInternalContextSourceInput(spec);

  if (options.generating) {
    return {
      status: 'generating',
      statusLabel: 'generating...',
      canView,
      canGenerate: hasSource,
      actionLabel: canView ? 'Regenerate design specification' : 'Generate design specification',
    };
  }

  if (!hasSource) {
    return {
      status: 'missing',
      statusLabel: 'missing',
      canView: false,
      canGenerate: false,
    };
  }

  if (doc?.error) {
    return {
      status: 'error',
      statusLabel: 'error',
      canView,
      canGenerate: true,
      actionLabel: 'Retry design specification',
    };
  }

  if (!doc?.content?.trim()) {
    return {
      status: 'ready-to-generate',
      statusLabel: 'ready to generate',
      canView: false,
      canGenerate: true,
      actionLabel: 'Generate design specification',
    };
  }

  if (isInternalContextDocumentStale(spec, doc)) {
    return {
      status: 'needs-update',
      statusLabel: 'needs update',
      canView: true,
      canGenerate: true,
      actionLabel: 'Regenerate design specification',
    };
  }

  return {
    status: 'ready',
    canView: true,
    canGenerate: false,
  };
}

function appendBlock(lines: string[], tag: string, body: string | undefined): void {
  const t = body?.trim();
  if (!t) return;
  lines.push(`<${tag}>\n${t}\n</${tag}>`);
}

function appendImageBlock(lines: string[], spec: DesignSpec): void {
  const rows: string[] = [];
  for (const sectionId of SOURCE_SECTION_IDS) {
    const section = spec.sections[sectionId];
    for (const image of section?.images ?? []) {
      rows.push(
        `- ${sectionId}: ${image.filename}${image.description ? ` — ${image.description}` : ''}${
          image.extractedContext ? ` (${image.extractedContext})` : ''
        }`,
      );
    }
  }
  if (rows.length > 0) lines.push(`<reference_images>\n${rows.join('\n')}\n</reference_images>`);
}

export function buildInternalContextUserMessage(spec: DesignSpec): string {
  const lines = [
    'Synthesize an internal design context document from the following user-provided inputs.',
    `<canvas_title>${spec.title}</canvas_title>`,
  ];

  appendBlock(lines, 'design_brief', spec.sections['design-brief']?.content);
  appendBlock(lines, 'research_context', spec.sections['research-context']?.content);
  appendBlock(lines, 'objectives_metrics', spec.sections['objectives-metrics']?.content);
  appendBlock(lines, 'design_constraints', spec.sections['design-constraints']?.content);
  appendImageBlock(lines, spec);

  return lines.join('\n\n');
}
