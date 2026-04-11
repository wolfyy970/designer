import { generateId, now } from './utils';
import type { ReferenceImage } from '../types/spec';

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
