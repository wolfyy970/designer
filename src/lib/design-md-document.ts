import type { DesignMdDocument, DesignMdLintSummary } from '../types/workspace-domain';

export function buildDesignMdDocument(params: {
  content: string;
  sourceHash: string;
  providerId: string;
  modelId: string;
  lint?: DesignMdLintSummary;
  generatedAt?: string;
}): DesignMdDocument {
  return {
    content: params.content,
    sourceHash: params.sourceHash,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    providerId: params.providerId,
    modelId: params.modelId,
    lint: params.lint,
  };
}

export function buildFailedDesignMdDocument(params: {
  existing?: DesignMdDocument;
  sourceHash: string;
  providerId: string;
  modelId: string;
  error: string;
  generatedAt?: string;
}): DesignMdDocument {
  return {
    content: params.existing?.content ?? '',
    sourceHash: params.sourceHash,
    generatedAt: params.existing?.generatedAt ?? params.generatedAt ?? new Date().toISOString(),
    providerId: params.providerId,
    modelId: params.modelId,
    lint: params.existing?.lint,
    error: params.error,
  };
}
