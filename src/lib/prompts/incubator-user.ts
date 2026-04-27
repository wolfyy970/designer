import type { DesignSpec } from '../../types/spec';
import type { HypothesisStrategy } from '../../types/incubator';
import { interpolate } from '../utils';
import { getSectionContent, collectImageLines } from './helpers';

function imageBlock(spec: DesignSpec): string {
  const lines = collectImageLines(spec);
  if (lines.length === 0) return '';
  return '## Reference Images\n' + lines.join('\n');
}

/** Optional appendix after the main incubate instruction; empty when no reference designs. */
export function formatReferenceDesignsBlock(
  referenceDesigns?: { name: string; code: string }[],
): string {
  if (!referenceDesigns || referenceDesigns.length === 0) return '';
  let block = '\n\n## Reference Designs (from previous iterations)\n';
  block +=
    'The following designs were generated in a previous iteration. Analyze their strengths and weaknesses, then propose new hypothesis strategies that improve upon them.\n\n';
  for (const ref of referenceDesigns) {
    block += `### ${ref.name}\n\`\`\`\n${ref.code}\n\`\`\`\n\n`;
  }
  return block;
}

/** Optional appendix listing sibling strategies; empty when none. */
export function formatExistingHypothesesBlock(
  existingStrategies?: HypothesisStrategy[],
): string {
  const existing = existingStrategies;
  if (!existing || existing.length === 0) return '';
  let block = '\n\n## Existing Hypotheses (already explored)\n';
  block +=
    'The following strategies already exist. Do NOT reproduce them. Generate new strategies that explore genuinely different regions of the solution space — not different for novelty, but pushing toward ideas that could outperform these. Every new strategy must still be grounded in the specification\'s stated needs and research.\n\n';
  for (let i = 0; i < existing.length; i++) {
    const s = existing[i]!;
    block += `${i + 1}. **${s.name}**\n`;
    if (s.hypothesis) block += `   - Hypothesis: ${s.hypothesis}\n`;
    if (s.rationale) block += `   - Rationale: ${s.rationale}\n`;
    if (s.measurements) block += `   - Measurements: ${s.measurements}\n`;
    const dims = Object.entries(s.dimensionValues);
    if (dims.length > 0) {
      block += `   - Dimension values: ${dims.map(([k, v]) => `${k}: ${v}`).join(', ')}\n`;
    }
    block += '\n';
  }
  return block;
}

/** Optional exact-count instruction; empty when count is omitted. */
export function formatIncubatorHypothesisCountLine(count: number | undefined): string {
  if (count == null) return '';
  return `\nProduce exactly ${count} new hypothesis strategies.\n`;
}

export interface IncubatorPromptOptions {
  count?: number;
  existingStrategies?: HypothesisStrategy[];
  internalContextDocument?: string;
  designSystemDocuments?: { nodeId: string; title: string; content: string }[];
}

export function buildIncubatorUserPrompt(
  spec: DesignSpec,
  incubatorUserTemplate: string,
  referenceDesigns?: { name: string; code: string }[],
  options?: IncubatorPromptOptions,
): string {
  return interpolate(incubatorUserTemplate, {
    SPEC_TITLE: spec.title,
    DESIGN_BRIEF: getSectionContent(spec, 'design-brief'),
    EXISTING_DESIGN: getSectionContent(spec, 'existing-design'),
    RESEARCH_CONTEXT: getSectionContent(spec, 'research-context'),
    OBJECTIVES_METRICS: getSectionContent(spec, 'objectives-metrics'),
    DESIGN_CONSTRAINTS: getSectionContent(spec, 'design-constraints'),
    IMAGE_BLOCK: imageBlock(spec),
    INTERNAL_CONTEXT_DOCUMENT_BLOCK: formatInternalContextDocumentBlock(options?.internalContextDocument),
    DESIGN_SYSTEM_DOCUMENTS_BLOCK: formatDesignSystemDocumentsBlock(options?.designSystemDocuments),
    REFERENCE_DESIGNS_BLOCK: formatReferenceDesignsBlock(referenceDesigns),
    EXISTING_HYPOTHESES_BLOCK: formatExistingHypothesesBlock(options?.existingStrategies),
    INCUBATOR_HYPOTHESIS_COUNT_LINE: formatIncubatorHypothesisCountLine(options?.count),
  });
}

export function formatDesignSystemDocumentsBlock(
  documents?: { nodeId: string; title: string; content: string }[],
): string {
  const docs = documents?.filter((doc) => doc.content.trim());
  if (!docs || docs.length === 0) return '';
  let block = '\n\n## DESIGN.md Documents (optional visual-system context)\n';
  block +=
    'Use these generated DESIGN.md documents as optional visual-system context while forming hypotheses. Respect their tokens, component guidance, and documented uncertainty when present; do not assume a DESIGN.md exists when this block is absent.\n\n';
  for (const doc of docs) {
    block += `### Source: ${doc.title || 'Design System'} (${doc.nodeId})\n\n${doc.content.trim()}\n\n`;
  }
  return block;
}

export function formatInternalContextDocumentBlock(document?: string): string {
  const body = document?.trim();
  if (!body) return '';
  return `\n\n## Internal Context Document (system-generated synthesis)\nUse this derived context as an interpretation aid for hypothesis generation. It is grounded in the user inputs but may contain labeled inferences; keep final hypotheses anchored to the specification.\n\n${body}\n`;
}
