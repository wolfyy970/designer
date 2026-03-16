import type { PromptKey } from '../../stores/prompt-store';

import { PROMPT_DEFAULTS } from './shared-defaults';

// ── Default prompt text ──────────────────────────────────────────────

export const DEFAULTS: Record<PromptKey, string> = PROMPT_DEFAULTS as Record<PromptKey, string>;

// ── Env var map ─────────────────────────────────────────────────────

export const ENV_KEYS: Record<PromptKey, string> = {
  compilerSystem: 'VITE_PROMPT_COMPILER_SYSTEM',
  compilerUser: 'VITE_PROMPT_COMPILER_USER',
  genSystemHtml: 'VITE_PROMPT_GEN_SYSTEM_HTML',
  genSystemHtmlAgentic: 'VITE_PROMPT_GEN_SYSTEM_HTML_AGENTIC',
  variant: 'VITE_PROMPT_VARIANT',
  designSystemExtract: 'VITE_PROMPT_DESIGN_SYSTEM_EXTRACT',
};

// ── Prompt metadata (for the editor UI) ─────────────────────────────

export interface PromptMeta {
  key: PromptKey;
  label: string;
  description: string;
  variables?: string[];
}

export const PROMPT_META: PromptMeta[] = [
  {
    key: 'compilerSystem',
    label: 'Incubator — System',
    description: 'System prompt for the Incubator (compiler). Defines the role, task, output format, and guidelines for producing dimension maps.',
  },
  {
    key: 'compilerUser',
    label: 'Incubator — User',
    description: 'User prompt template for the Incubator. Provides the spec data to analyze.',
    variables: ['SPEC_TITLE', 'DESIGN_BRIEF', 'EXISTING_DESIGN', 'RESEARCH_CONTEXT', 'OBJECTIVES_METRICS', 'DESIGN_CONSTRAINTS', 'IMAGE_BLOCK'],
  },
  {
    key: 'genSystemHtml',
    label: 'Designer — System',
    description: 'System prompt for design generation. The model receives this plus the hypothesis/spec context and returns a complete self-contained HTML document.',
  },
  {
    key: 'genSystemHtmlAgentic',
    label: 'Designer — System (Agentic)',
    description: 'System prompt for agentic multi-file design generation. Instructs the agent to reason about the hypothesis before writing files, then self-critique and revise.',
  },
  {
    key: 'variant',
    label: 'Designer — User',
    description: 'User prompt template for design generation. Provides the hypothesis and spec context.',
    variables: ['STRATEGY_NAME', 'HYPOTHESIS', 'RATIONALE', 'MEASUREMENTS', 'DIMENSION_VALUES', 'DESIGN_BRIEF', 'RESEARCH_CONTEXT', 'IMAGE_BLOCK', 'OBJECTIVES_METRICS', 'DESIGN_CONSTRAINTS', 'DESIGN_SYSTEM'],
  },
  {
    key: 'designSystemExtract',
    label: 'Design System — Extract',
    description: 'System prompt for extracting design tokens, components, and patterns from uploaded design system screenshots.',
  },
];
