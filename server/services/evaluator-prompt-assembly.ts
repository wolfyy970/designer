/**
 * Builds the multi-part user message sent to LLM-based evaluator rubrics.
 */
import { bundleVirtualFS } from '../../src/lib/bundle-virtual-fs.ts';
import type { EvaluationContextPayload } from '../../src/types/evaluation.ts';
import { env } from '../env.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { EVAL_BUNDLE_MAX_CHARS, EVAL_FILE_MAX_CHARS } from '../lib/content-limits.ts';

function truncateBlock(label: string, content: string): string {
  if (content.length <= EVAL_FILE_MAX_CHARS) return `<file path="${label}">\n${content}\n</file>`;
  return (
    `<file path="${label}">\n${content.slice(0, EVAL_FILE_MAX_CHARS)}\n…[truncated]\n</file>`
  );
}

export function buildEvaluatorUserContent(
  files: Record<string, string>,
  compiledPrompt: string,
  context?: EvaluationContextPayload,
  /** Live preview URL for this artifact (same virtual FS the UI serves). */
  previewPageUrl?: string,
): string {
  let bundled = '';
  try {
    bundled = bundleVirtualFS(files);
  } catch (err) {
    const msg = normalizeError(err, 'bundle failed');
    if (env.isDev) {
      console.warn('[eval:bundle]', msg, err);
    }
    bundled = `<!-- bundleVirtualFS failed: ${msg} -->\n[bundle error]`;
  }
  if (bundled.length > EVAL_BUNDLE_MAX_CHARS) {
    bundled = bundled.slice(0, EVAL_BUNDLE_MAX_CHARS) + '\n…[truncated]';
  }

  const fileBlocks = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => truncateBlock(path, content))
    .join('\n\n');

  const ctxParts: string[] = [];
  if (context?.strategyName) ctxParts.push(`<strategy_name>\n${context.strategyName}\n</strategy_name>`);
  if (context?.hypothesis) ctxParts.push(`<hypothesis_bet>\n${context.hypothesis}\n</hypothesis_bet>`);
  if (context?.rationale) ctxParts.push(`<rationale>\n${context.rationale}\n</rationale>`);
  if (context?.measurements) ctxParts.push(`<measurements_kpis>\n${context.measurements}\n</measurements_kpis>`);
  if (context?.dimensionValues && Object.keys(context.dimensionValues).length > 0) {
    ctxParts.push(
      `<dimension_values>\n${Object.entries(context.dimensionValues)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')}\n</dimension_values>`,
    );
  }
  if (context?.objectivesMetrics) {
    ctxParts.push(`<objectives_metrics>\n${context.objectivesMetrics}\n</objectives_metrics>`);
  }
  if (context?.designConstraints) {
    ctxParts.push(`<design_constraints>\n${context.designConstraints}\n</design_constraints>`);
  }
  if (context?.designSystemSnapshot) {
    ctxParts.push(`<design_system>\n${context.designSystemSnapshot}\n</design_system>`);
  }
  if (context?.outputFormat) {
    ctxParts.push(`<output_format>\n${context.outputFormat}\n</output_format>`);
  }

  return [
    '<instruction>Evaluate the artifact below. Return ONLY the JSON object specified in your system contract.</instruction>',
    '<compiled_generation_prompt>',
    compiledPrompt.length > EVAL_FILE_MAX_CHARS
      ? `${compiledPrompt.slice(0, EVAL_FILE_MAX_CHARS)}\n…[truncated]`
      : compiledPrompt,
    '</compiled_generation_prompt>',
    ctxParts.length > 0 ? `<structured_context>\n${ctxParts.join('\n\n')}\n</structured_context>` : '',
    previewPageUrl ? `<preview_page_url>\n${previewPageUrl}\n</preview_page_url>` : '',
    '<source_files>',
    fileBlocks,
    '</source_files>',
    '<bundled_preview_html>',
    bundled,
    '</bundled_preview_html>',
  ]
    .filter(Boolean)
    .join('\n\n');
}
