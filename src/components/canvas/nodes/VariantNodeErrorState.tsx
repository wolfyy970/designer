import { AlertCircle } from 'lucide-react';
import type { GenerationResult } from '../../../types/provider';

type Props = {
  result: GenerationResult;
};

export function VariantNodeErrorState({ result }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-error-subtle p-4">
      <AlertCircle size={16} className="mb-2 text-error" />
      <p className="text-center text-xs text-error">{result.error ?? 'Generation failed'}</p>
    </div>
  );
}
