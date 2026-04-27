import type { DesignSpec, InternalContextDocument, SpecSectionId } from '../types/spec';
import { hashDocumentSource, imageFingerprint } from './document-fingerprint';

const SOURCE_SECTION_IDS: SpecSectionId[] = [
  'design-brief',
  'existing-design',
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
  appendBlock(lines, 'existing_design', spec.sections['existing-design']?.content);
  appendBlock(lines, 'research_context', spec.sections['research-context']?.content);
  appendBlock(lines, 'objectives_metrics', spec.sections['objectives-metrics']?.content);
  appendBlock(lines, 'design_constraints', spec.sections['design-constraints']?.content);
  appendImageBlock(lines, spec);

  return lines.join('\n\n');
}
