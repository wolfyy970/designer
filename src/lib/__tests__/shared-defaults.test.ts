import { describe, it, expect } from 'vitest';
import { PROMPT_DEFAULTS } from '../prompts/shared-defaults';

const EXPECTED_KEYS = [
  'compilerSystem',
  'compilerUser',
  'genSystemHtml',
  'genSystemHtmlAgentic',
  'variant',
  'designSystemExtract',
  'designSystemExtractUser',
  'agentCompactionSystem',
  'sandboxAgentsContext',
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

  it('compilerSystem avoids example strategy names models tend to echo', () => {
    expect(PROMPT_DEFAULTS.compilerSystem).not.toContain('Trust-Forward');
    expect(PROMPT_DEFAULTS.compilerSystem).not.toContain('Trust first');
    expect(PROMPT_DEFAULTS.compilerSystem).not.toContain('Progressive Disclosure');
  });

  it('genSystemHtml contains HTML instruction', () => {
    expect(PROMPT_DEFAULTS.genSystemHtml).toContain('HTML');
  });

  it('genSystemHtmlAgentic references hypothesis-driven reasoning', () => {
    expect(PROMPT_DEFAULTS.genSystemHtmlAgentic).toContain('hypothesis');
    expect(PROMPT_DEFAULTS.genSystemHtmlAgentic).toContain('plan_files');
    expect(PROMPT_DEFAULTS.genSystemHtmlAgentic).toContain('write_file');
    expect(PROMPT_DEFAULTS.genSystemHtmlAgentic).toContain('read_file');
    expect(PROMPT_DEFAULTS.genSystemHtmlAgentic).toContain('milestone');
    expect(PROMPT_DEFAULTS.genSystemHtmlAgentic).toContain('available_skills');
    expect(PROMPT_DEFAULTS.genSystemHtmlAgentic).toContain('agent_skills');
  });

  it('genSystemHtmlAgentic documents virtual workspace tools including ls and find', () => {
    const p = PROMPT_DEFAULTS.genSystemHtmlAgentic;
    [
      'plan_files',
      'write_file',
      'edit_file',
      'read_file',
      'ls(',
      'find(',
      'todo_write',
      'grep',
      'validate_js',
      'validate_html',
    ].forEach((tool) => expect(p).toContain(tool));
  });

  it('genSystemHtmlAgentic describes grep as line-oriented with schema-aligned params', () => {
    const p = PROMPT_DEFAULTS.genSystemHtmlAgentic;
    expect(p).toContain('Line-oriented');
    expect(p).toContain('literal?');
    expect(p).toContain('ignoreCase?');
  });

  it('genSystemHtmlAgentic does not hardcode a three-file worldview', () => {
    const p = PROMPT_DEFAULTS.genSystemHtmlAgentic;
    expect(p).not.toContain('three-file bundle');
    expect(p).toContain('file count is not a goal');
    expect(p).toContain('local relative paths');
  });

  it('sandboxAgentsContext describes static workspace limits and forbids bundlers', () => {
    const p = PROMPT_DEFAULTS.sandboxAgentsContext;
    expect(p).toContain('virtual filesystem');
    expect(p).toContain('Vite');
    expect(p).toContain('npm');
    expect(p).toContain('index.html');
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
