import { describe, it, expect } from 'vitest';
import type { TodoItem } from '../../../../src/types/provider.ts';
import type { SkillCatalogEntry } from '../../../lib/skill-schema.ts';
import { createAgentBashSandbox, SANDBOX_PROJECT_ROOT } from '../../agent-bash-sandbox.ts';
import { createSandboxBashTool } from '../../pi-bash-tool.ts';
import {
  createTodoWriteTool,
  createUseSkillTool,
  createValidateHtmlTool,
  createValidateJsTool,
} from '../../pi-app-tools.ts';
import { createVirtualPiCodingTools } from '../virtual-tools.ts';
import type { ToolDefinition } from '../types.ts';

function catalogEntry(overrides: Partial<SkillCatalogEntry> = {}): SkillCatalogEntry {
  return {
    key: 'sample-skill',
    dir: '/tmp/sample',
    name: 'Sample',
    description: 'Sample for contract tests',
    tags: [],
    when: 'auto',
    bodyMarkdown: '# body',
    ...overrides,
  };
}

function buildPiSandboxToolset(skillEntries: SkillCatalogEntry[] = [
  catalogEntry(),
]): ToolDefinition[] {
  const bash = createAgentBashSandbox({});
  const todoState: { current: TodoItem[] } = { current: [] };
  const virtual = createVirtualPiCodingTools(bash, () => {});
  const bashTool = createSandboxBashTool(bash, () => {});
  const todo = createTodoWriteTool(todoState, () => {});
  const useSkill = createUseSkillTool(skillEntries, () => {});
  const vjs = createValidateJsTool(bash);
  const vhtml = createValidateHtmlTool(bash);
  return [...virtual, bashTool, todo, useSkill, vjs, vhtml] as ToolDefinition[];
}

describe('Pi sandbox tool contracts (model-facing)', () => {
  it('exposes exactly 11 tools in agent order', () => {
    const tools = buildPiSandboxToolset();
    expect(tools.map((t) => t.name)).toEqual([
      'read',
      'write',
      'edit',
      'ls',
      'find',
      'grep',
      'bash',
      'todo_write',
      'use_skill',
      'validate_js',
      'validate_html',
    ]);
  });

  it.each(['read', 'write', 'edit', 'ls', 'find', 'grep'] as const)(
    'virtual tool %s description mentions sandbox root',
    (name) => {
      const tools = buildPiSandboxToolset();
      const t = tools.find((x) => x.name === name)!;
      expect(t.description).toContain(SANDBOX_PROJECT_ROOT);
    },
  );

  it('grep description mentions rg and truncation limits', () => {
    const tools = buildPiSandboxToolset();
    const grep = tools.find((t) => t.name === 'grep')!;
    expect(grep.description.toLowerCase()).toContain('rg');
    expect(grep.description).toMatch(/100|limit/i);
    expect(grep.description).toMatch(/500|char/i);
  });

  it('bash description mentions just-bash and disallows package managers', () => {
    const tools = buildPiSandboxToolset();
    const bt = tools.find((t) => t.name === 'bash')!;
    expect(bt.description.toLowerCase()).toContain('just-bash');
    expect(bt.description.toLowerCase()).toContain('npm');
  });

  it('validate_html description mentions structure and assets', () => {
    const tools = buildPiSandboxToolset();
    const v = tools.find((t) => t.name === 'validate_html')!;
    expect(v.description.toLowerCase()).toContain('doctype');
    expect(v.description.toLowerCase()).toMatch(/landmark|script|style/i);
    expect(v.description.toLowerCase()).toMatch(/asset|local/i);
  });

  it('edit description mentions exactly once and minimum context', () => {
    const tools = buildPiSandboxToolset();
    const ed = tools.find((t) => t.name === 'edit')!;
    expect(ed.description.toLowerCase()).toContain('exactly once');
    expect(ed.description.toLowerCase()).toMatch(/3 lines|surrounding context/);
  });

  it('write description steers toward edit for partial changes', () => {
    const tools = buildPiSandboxToolset();
    const wr = tools.find((t) => t.name === 'write')!;
    expect(wr.description.toLowerCase()).toContain('edit');
    expect(wr.description.toLowerCase()).toContain('partial');
  });

  it('todo_write schema includes todos array with status enum', () => {
    const tools = buildPiSandboxToolset();
    const td = tools.find((t) => t.name === 'todo_write')!;
    const json = JSON.stringify(td.parameters);
    expect(json).toContain('todos');
    expect(json).toContain('pending');
    expect(json).toContain('in_progress');
    expect(json).toContain('completed');
  });

  it('use_skill description embeds available_skills XML when catalog non-empty', () => {
    const tools = buildPiSandboxToolset([catalogEntry({ key: 'a11y', name: 'A11y' })]);
    const us = tools.find((t) => t.name === 'use_skill')!;
    expect(us.description).toContain('<available_skills>');
    expect(us.description).toContain('key="a11y"');
  });

  it('use_skill description explains empty catalog', () => {
    const tools = buildPiSandboxToolset([]);
    const us = tools.find((t) => t.name === 'use_skill')!;
    expect(us.description).toMatch(/No repo skills/i);
  });

  it('validate_js parameters require path', () => {
    const tools = buildPiSandboxToolset();
    const v = tools.find((t) => t.name === 'validate_js')!;
    expect(JSON.stringify(v.parameters)).toContain('path');
  });

  it('each virtual tool has required path or pattern in parameters', () => {
    const tools = createVirtualPiCodingTools(createAgentBashSandbox({}), () => {});
    const read = tools.find((t) => t.name === 'read')!;
    expect(JSON.stringify(read.parameters)).toContain('path');
    const find = tools.find((t) => t.name === 'find')!;
    expect(JSON.stringify(find.parameters)).toContain('pattern');
    const grep = tools.find((t) => t.name === 'grep')!;
    expect(JSON.stringify(grep.parameters)).toContain('pattern');
  });

  it('bash parameters require command string', () => {
    const tools = buildPiSandboxToolset();
    const bt = tools.find((t) => t.name === 'bash')!;
    expect(JSON.stringify(bt.parameters)).toContain('command');
  });

  it('virtual tool descriptions avoid real developer home paths', () => {
    const tools = createVirtualPiCodingTools(createAgentBashSandbox({}), () => {});
    for (const t of tools) {
      expect(t.description).not.toContain('/Users/');
      expect(t.description).not.toMatch(/\/etc\/passwd/i);
    }
    const find = tools.find((t) => t.name === 'find')!;
    expect(find.description.toLowerCase()).toContain('no .gitignore');
  });

  it('read description documents text-only and size bounds', () => {
    const tools = createVirtualPiCodingTools(createAgentBashSandbox({}), () => {});
    const read = tools.find((t) => t.name === 'read')!;
    expect(read.description.toLowerCase()).toMatch(/utf-8|text/);
    expect(read.description).toMatch(/2000|50/);
  });
});
