import { PROMPT_META, type PromptKey } from '../../../stores/prompt-store';

export interface Diagnostic {
  level: 'info' | 'warning';
  message: string;
}

export function validatePrompt(key: PromptKey, value: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const meta = PROMPT_META.find((m) => m.key === key);

  if (meta?.variables) {
    const missing = meta.variables.filter((v) => !value.includes(`{{${v}}}`));
    if (missing.length > 0) {
      diagnostics.push({
        level: 'warning',
        message: `Missing variables: ${missing.map((v) => `{{${v}}}`).join(', ')}. Data for these sections won't appear in the prompt.`,
      });
    }

    const found = [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const unknown = found.filter((v) => !meta.variables!.includes(v));
    if (unknown.length > 0) {
      diagnostics.push({
        level: 'warning',
        message: `Unknown variables: ${unknown.map((v) => `{{${v}}}`).join(', ')}. These won't be replaced with data.`,
      });
    }
  }

  if (key === 'compilerSystem' && !value.toLowerCase().includes('json')) {
    diagnostics.push({
      level: 'warning',
      message:
        'Should instruct the model to return JSON. The Incubator parses the response with JSON.parse().',
    });
  }

  if (key === 'genSystemHtml' && !value.toLowerCase().includes('html')) {
    diagnostics.push({
      level: 'warning',
      message:
        'Should instruct the model to return HTML. Output is rendered in a sandboxed iframe.',
    });
  }

  return diagnostics;
}

export const PROMPT_GROUPS: { label: string; keys: PromptKey[] }[] = [
  { label: 'Incubator', keys: ['compilerSystem', 'compilerUser'] },
  { label: 'Designer', keys: ['variant', 'genSystemHtml', 'genSystemHtmlAgentic'] },
  { label: 'Design System', keys: ['designSystemExtract'] },
  {
    label: 'Evaluator',
    keys: ['evalDesignSystem', 'evalStrategySystem', 'evalImplementationSystem'],
  },
];

export function shortLabel(key: PromptKey): string {
  const meta = PROMPT_META.find((m) => m.key === key);
  if (!meta) return key;
  return meta.label.replace(/^(Incubator|Agent Designer|Legacy Designer|Designer|Design System)\s*—\s*/, '');
}
