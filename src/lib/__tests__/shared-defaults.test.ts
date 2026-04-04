import { describe, it, expect } from 'vitest';
import { PROMPT_DEFAULTS } from '../prompts/shared-defaults';

const EXPECTED_KEYS = [
  'hypotheses-generator-system',
  'incubator-user-inputs',
  'designer-direct-system',
  'designer-agentic-system',
  'designer-agentic-revision-user',
  'designer-hypothesis-inputs',
  'design-system-extract-system',
  'design-system-extract-user-input',
  'agent-context-compaction',
  'agents-md-file',
  'evaluator-design-quality',
  'evaluator-strategy-fidelity',
  'evaluator-implementation',
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

  it('hypotheses-generator-system contains expected structural content', () => {
    expect(PROMPT_DEFAULTS['hypotheses-generator-system']).toContain('dimension map');
    expect(PROMPT_DEFAULTS['hypotheses-generator-system']).toContain('JSON');
  });

  it('hypotheses-generator-system avoids example strategy names models tend to echo', () => {
    expect(PROMPT_DEFAULTS['hypotheses-generator-system']).not.toContain('Trust-Forward');
    expect(PROMPT_DEFAULTS['hypotheses-generator-system']).not.toContain('Trust first');
    expect(PROMPT_DEFAULTS['hypotheses-generator-system']).not.toContain('Progressive Disclosure');
  });

  it('designer-direct-system contains HTML instruction', () => {
    expect(PROMPT_DEFAULTS['designer-direct-system']).toContain('HTML');
  });

  it('designer-agentic-system references hypothesis-driven reasoning', () => {
    const p = PROMPT_DEFAULTS['designer-agentic-system'];
    expect(p).toContain('hypothesis');
    expect(p).toContain('plan_files');
    expect(p).toContain('write_file');
    expect(p).toContain('read_file');
    expect(p).toContain('milestone');
    expect(p).toContain('mandatory_skill_check');
    expect(p).toContain('use_skill');
  });

  it('designer-agentic-system documents virtual workspace tools including ls and find', () => {
    const p = PROMPT_DEFAULTS['designer-agentic-system'];
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

  it('designer-agentic-system describes grep as line-oriented with schema-aligned params', () => {
    const p = PROMPT_DEFAULTS['designer-agentic-system'];
    expect(p).toContain('Line-oriented');
    expect(p).toContain('literal?');
    expect(p).toContain('ignoreCase?');
  });

  it('designer-agentic-system allows flexible layout and multi-page artifacts', () => {
    const p = PROMPT_DEFAULTS['designer-agentic-system'];
    expect(p).not.toContain('Contain NO inline');
    expect(p).toContain('file count is not a goal');
    expect(p.toLowerCase()).toContain('local relative paths');
    expect(p).toContain('validate_html');
    expect(p).toMatch(/every[\s\S]{0,40}HTML file/i);
  });

  it('agents-md-file describes static workspace limits and forbids bundlers', () => {
    const p = PROMPT_DEFAULTS['agents-md-file'];
    expect(p).toContain('virtual');
    expect(p).toContain('Vite');
    expect(p).toContain('npm');
    expect(p).toContain('index.html');
    expect(p).toContain('no fixed trio');
  });

  it('designer-hypothesis-inputs prompt contains template variables', () => {
    expect(PROMPT_DEFAULTS['designer-hypothesis-inputs']).toContain('{{STRATEGY_NAME}}');
    expect(PROMPT_DEFAULTS['designer-hypothesis-inputs']).toContain('{{DESIGN_BRIEF}}');
  });

  it('incubator-user-inputs prompt contains template variables', () => {
    expect(PROMPT_DEFAULTS['incubator-user-inputs']).toContain('{{SPEC_TITLE}}');
    expect(PROMPT_DEFAULTS['incubator-user-inputs']).toContain('{{DESIGN_CONSTRAINTS}}');
  });

  it('evaluator prompts require JSON output', () => {
    expect(PROMPT_DEFAULTS['evaluator-design-quality']).toContain('JSON');
    expect(PROMPT_DEFAULTS['evaluator-strategy-fidelity']).toContain('JSON');
    expect(PROMPT_DEFAULTS['evaluator-implementation']).toContain('JSON');
  });

  it('evaluator-implementation mentions preview_page_url', () => {
    expect(PROMPT_DEFAULTS['evaluator-implementation']).toContain('preview_page_url');
  });
});
