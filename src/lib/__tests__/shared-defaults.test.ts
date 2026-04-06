import { describe, it, expect } from 'vitest';
import { PROMPT_KEYS } from '../prompts/defaults';
import { PROMPT_DEFAULTS } from '../prompts/shared-defaults';

describe('PROMPT_DEFAULTS', () => {
  it('defines every prompt key from PROMPT_KEYS', () => {
    for (const key of PROMPT_KEYS) {
      expect(PROMPT_DEFAULTS[key]).toBeDefined();
    }
  });

  it('has non-empty string for every key', () => {
    for (const key of PROMPT_KEYS) {
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

  it('designer-agentic-system references hypothesis-driven reasoning', () => {
    const p = PROMPT_DEFAULTS['designer-agentic-system'];
    expect(p).toContain('hypothesis');
    expect(p).not.toContain('plan_files');
    expect(p).not.toContain('write_file');
    expect(p).not.toContain('read_file');
    expect(p).not.toContain('edit_file');
    expect(p).toContain('**write**');
    expect(p).toContain('**edit**');
    expect(p).toContain('**read**');
    expect(p).toMatch(/\bbash\b/);
    expect(p).toContain('milestone');
    expect(p).toContain('mandatory_skill_check');
    expect(p).toContain('use_skill');
  });

  it('designer-agentic-system documents virtual workspace tools including ls and find', () => {
    const p = PROMPT_DEFAULTS['designer-agentic-system'];
    [
      '**write**',
      '**edit**',
      '**read**',
      'ls or find',
      'todo_write',
      'grep',
      'validate_js',
      'validate_html',
    ].forEach((tool) => expect(p).toContain(tool));
  });

  it('designer-agentic-system documents just-bash sandbox environment', () => {
    const p = PROMPT_DEFAULTS['designer-agentic-system'];
    expect(p).toContain('<sandbox_environment>');
    expect(p).toContain('just-bash');
    expect(p).toContain('npm');
    expect(p).toContain('rg');
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
    expect(p).not.toContain('## Shell (bash tool)');
  });

  it('designer-hypothesis-inputs prompt contains template variables', () => {
    expect(PROMPT_DEFAULTS['designer-hypothesis-inputs']).toContain('{{STRATEGY_NAME}}');
    expect(PROMPT_DEFAULTS['designer-hypothesis-inputs']).toContain('{{DESIGN_BRIEF}}');
  });

  it('incubator-user-inputs prompt contains template variables', () => {
    expect(PROMPT_DEFAULTS['incubator-user-inputs']).toContain('{{SPEC_TITLE}}');
    expect(PROMPT_DEFAULTS['incubator-user-inputs']).toContain('{{DESIGN_CONSTRAINTS}}');
    expect(PROMPT_DEFAULTS['incubator-user-inputs']).toContain('{{REFERENCE_DESIGNS_BLOCK}}');
    expect(PROMPT_DEFAULTS['incubator-user-inputs']).toContain('{{EXISTING_HYPOTHESES_BLOCK}}');
    expect(PROMPT_DEFAULTS['incubator-user-inputs']).toContain('{{INCUBATOR_HYPOTHESIS_COUNT_LINE}}');
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
