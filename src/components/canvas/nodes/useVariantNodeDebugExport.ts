import { useCallback, useMemo, useState } from 'react';
import type { GenerationResult } from '../../../types/provider';
import type { VariantStrategy } from '../../../types/compiler';
import {
  type DesignDebugExportOptions,
  buildDesignRunDebugMarkdown,
  downloadTextFile,
} from '../../../lib/debug-markdown-export';
import { loadProvenance, loadCode, loadFiles } from '../../../services/idb-storage';

export function useVariantNodeDebugExport(options: {
  result: GenerationResult | undefined;
  nodeId: string;
  variantName: string;
  strategy: VariantStrategy | undefined;
  slug: string;
  code: string | undefined;
  files: Record<string, string> | undefined;
}) {
  const { result, nodeId, variantName, strategy, slug, code, files } = options;
  const [debugExportOpen, setDebugExportOpen] = useState(false);

  const debugExportPreviewInput = useMemo(
    () =>
      result
        ? {
            exportedAt: new Date().toISOString(),
            variantNodeId: nodeId,
            variantName,
            strategyName: strategy?.name,
            strategy,
            result,
            code: code ?? result.liveCode ?? undefined,
            files: files ?? result.liveFiles ?? undefined,
          }
        : null,
    [nodeId, variantName, strategy, result, code, files],
  );

  const handleConfirmDebugExport = useCallback(
    async (exportOptions: DesignDebugExportOptions) => {
      if (!result) return;
      const safeLoad = async <T,>(p: Promise<T | undefined>): Promise<T | undefined> => {
        try {
          return await p;
        } catch {
          return undefined;
        }
      };
      const [provenance, codeIdb, filesIdb] = await Promise.all([
        safeLoad(loadProvenance(result.id)),
        safeLoad(loadCode(result.id)),
        safeLoad(loadFiles(result.id)),
      ]);
      const mergedFiles = filesIdb ?? files ?? result.liveFiles;
      const mergedCode = codeIdb ?? code ?? result.liveCode;
      const md = buildDesignRunDebugMarkdown(
        {
          exportedAt: new Date().toISOString(),
          variantNodeId: nodeId,
          variantName,
          strategyName: strategy?.name,
          strategy,
          result,
          provenance: provenance ?? undefined,
          code: mergedCode ?? undefined,
          files: mergedFiles ?? undefined,
        },
        exportOptions,
      );
      const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      downloadTextFile(`${slug}-run-v${result.runNumber}-debug-${stamp}.md`, md);
      setDebugExportOpen(false);
    },
    [nodeId, result, variantName, strategy, slug, code, files],
  );

  return {
    debugExportOpen,
    setDebugExportOpen,
    debugExportPreviewInput,
    handleConfirmDebugExport,
  };
}
