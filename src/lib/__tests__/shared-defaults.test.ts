import { describe, it, expect } from 'vitest';
import { PROMPT_DEFAULTS } from '../prompts/shared-defaults';

const EXPECTED_KEYS = [
  'compilerSystem',
  'compilerUser',
  'genSystemHtml',
  'genSystemHtmlAgentic',
  'variant',
  'designSystemExtract',
  'evalDesignSystem',
  'evalStrategySystem',
  'evalImplementationSystem',
] as const;

describe('PROMPT_DEFAULTS', () => {
  it('defines every prompt key', () => {
    for (const key of EXPECTED_KEYS) {
      expect(PROMPT_DEFAULTS).toHaveProperty(key);
    }
  });

  it('has non-empty string for every key', () => {
    for (const key of EXPECTED_KEYS) {
      const val = PROMPT_DEFAULTS[key];
      expect(typeof val).toBe('string');
      expect(val.trim().length).toBeGreaterThan(0);
    }
  });

  it('compilerSystem contains expected structural content', () => {
    expect(PROMPT_DEFAULTS.compilerSystem).toContain('dimension map');
    expect(PROMPT_DEFAULTS.compilerSystem).toContain('JSON');
  });

  it('genSystemHtml contains HTML instruction', () => {
    expect(PROMPT_DEFAULTS.genSystemHtml).toContain('HTML');
  });

  it('genSystemHtmlAgentic references hypothesis-driven reasoning', () => {
    expect(PROMPT_DEFAULTS.genSystemHtmlAgentic).toContain('hypothesis');
    expect(PROMPT_DEFAULTS.genSystemHtmlAgentic).toContain('plan_files');
    expect(PROMPT_DEFAULTS.genSystemHtmlAgentic).toContain('write_file');
    expect(PROMPT_DEFAULTS.genSystemHtmlAgentic).toContain('read_file');
  });

  it('genSystemHtmlAgentic documents all 9 agent tools', () => {
    const p = PROMPT_DEFAULTS.genSystemHtmlAgentic;
    ['plan_files', 'write_file', 'edit_file', 'read_file', 'ls_files', 'todo_write', 'grep', 'validate_js', 'validate_html']
      .forEach((tool) => expect(p).toContain(tool));
  });

  it('variant prompt contains template variables', () => {
    expect(PROMPT_DEFAULTS.variant).toContain('{{STRATEGY_NAME}}');
    expect(PROMPT_DEFAULTS.variant).toContain('{{DESIGN_BRIEF}}');
  });

  it('compilerUser prompt contains template variables', () => {
    expect(PROMPT_DEFAULTS.compilerUser).toContain('{{SPEC_TITLE}}');
    expect(PROMPT_DEFAULTS.compilerUser).toContain('{{DESIGN_CONSTRAINTS}}');
  });

  it('evaluator prompts require JSON output', () => {
    expect(PROMPT_DEFAULTS.evalDesignSystem).toContain('JSON');
    expect(PROMPT_DEFAULTS.evalStrategySystem).toContain('JSON');
    expect(PROMPT_DEFAULTS.evalImplementationSystem).toContain('JSON');
  });
});
