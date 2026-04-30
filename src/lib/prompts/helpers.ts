import type { DesignSpec } from '../../types/spec';
import { LEGACY_EXISTING_DESIGN_SECTION_ID } from '../spec-legacy';

/** Get trimmed section content, falling back to '(Not provided)' */
export function getSectionContent(spec: DesignSpec, sectionId: string): string {
  const section = spec.sections[sectionId as keyof typeof spec.sections];
  if (!section) return '(Not provided)';
  return section.content.trim() || '(Not provided)';
}

/** Collect described images across all spec sections as formatted lines */
export function collectImageLines(spec: DesignSpec): string[] {
  return Object.values(spec.sections)
    .filter((s) => s.id !== LEGACY_EXISTING_DESIGN_SECTION_ID)
    .flatMap((s) => s.images)
    .filter((img) => img.description.trim())
    .map((img) => `- [${img.filename}]: ${img.description}`);
}
