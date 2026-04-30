import { generateId, now } from './utils';
import type { DesignSystemMarkdownSource } from '../types/design-system-source';
import type { ReferenceImage } from '../types/spec';

export const DESIGN_SYSTEM_MARKDOWN_SOURCE_MAX_BYTES = 256 * 1024;

export function isDesignSystemMarkdownFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.md') || name.endsWith('.markdown');
}

/**
 * Read an image file as a data-URL-backed ReferenceImage (shared by dropzones / uploads).
 */
export function readFileAsReferenceImage(file: File): Promise<ReferenceImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: generateId(),
        filename: file.name,
        dataUrl: reader.result as string,
        description: '',
        createdAt: now(),
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Read a Markdown source file for Design System normalization.
 * The uploaded file is source evidence; the Incubator still prepares the canonical DESIGN.md artifact.
 */
export async function readFileAsDesignSystemMarkdownSource(
  file: File,
): Promise<DesignSystemMarkdownSource> {
  if (!isDesignSystemMarkdownFile(file)) {
    throw new Error('Only .md and .markdown files can be used as design-system Markdown sources.');
  }
  if (file.size > DESIGN_SYSTEM_MARKDOWN_SOURCE_MAX_BYTES) {
    throw new Error('Markdown source is too large. Keep design-system Markdown under 256 KB.');
  }
  const content = (await file.text()).replace(/\r\n?/g, '\n');
  return {
    id: generateId(),
    filename: file.name,
    content,
    sizeBytes: file.size,
    createdAt: now(),
  };
}
