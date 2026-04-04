import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ImagePlus } from 'lucide-react';
import type { SpecSectionId } from '../../types/spec';
import { useSpecStore } from '../../stores/spec-store';
import { readFileAsReferenceImage } from '../../lib/image-utils';
import ImagePreview from './ImagePreview';

const EMPTY_IMAGES: never[] = [];

interface ReferenceImageUploadProps {
  sectionId: SpecSectionId;
}

export default function ReferenceImageUpload({
  sectionId,
}: ReferenceImageUploadProps) {
  const images = useSpecStore((s) => s.spec.sections[sectionId]?.images ?? EMPTY_IMAGES);
  const addImage = useSpecStore((s) => s.addImage);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      for (const file of acceptedFiles) {
        addImage(sectionId, await readFileAsReferenceImage(file));
      }
    },
    [sectionId, addImage],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] },
  });

  return (
    <div className="mt-3 space-y-3">
      {images.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {images.map((img) => (
            <ImagePreview key={img.id} image={img} sectionId={sectionId} />
          ))}
        </div>
      )}
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          isDragActive
            ? 'border-accent bg-surface'
            : 'border-border hover:border-border hover:bg-surface'
        }`}
      >
        <input {...getInputProps()} />
        <ImagePlus
          size={20}
          className="mx-auto mb-1 text-fg-muted"
        />
        <p className="text-xs text-fg-secondary">
          {isDragActive
            ? 'Drop images here'
            : 'Drop reference images or click to upload'}
        </p>
      </div>
    </div>
  );
}
