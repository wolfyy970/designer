import { describe, it, expect, vi } from 'vitest';
import {
  createTodoWriteTool,
  createUseSkillTool,
  createValidateHtmlTool,
  createValidateJsTool,
} from '../pi-app-tools.ts';
import { createAgentBashSandbox } from '../agent-bash-sandbox.ts';
import type { SkillCatalogEntry } from '../../lib/skill-schema.ts';
import type { ExtensionContext } from '../pi-sdk/types.ts';
import type { TodoItem } from '../../../src/types/provider.ts';

const entry: SkillCatalogEntry = {
  key: 'demo',
  dir: '/tmp/demo',
  name: 'Demo',
  description: 'Demo skill',
  tags: [],
  when: 'auto',
  bodyMarkdown: 'Body text\n',
};

describe('createUseSkillTool', () => {
  it('returns skill body and calls onActivate', async () => {
    const onActivate = vi.fn();
    const tool = createUseSkillTool([entry], onActivate);
    const res = await tool.execute(
      'call-1',
      { name: 'demo' },
      undefined as never,
      undefined as never,
      {} as ExtensionContext,
    );
    expect(onActivate).toHaveBeenCalledWith({
      key: 'demo',
      name: 'Demo',
      description: 'Demo skill',
    });
    const first = res.content[0];
    expect(first?.type).toBe('text');
    expect(first && first.type === 'text' ? first.text : '').toContain('Body text');
    expect(first && first.type === 'text' ? first.text : '').toContain('# Demo');
  });

  it('returns error text for unknown skill key', async () => {
    const tool = createUseSkillTool([entry], vi.fn());
    const res = await tool.execute(
      'call-2',
      { name: 'missing' },
      undefined as never,
      undefined as never,
      {} as ExtensionContext,
    );
    const errChunk = res.content[0];
    const errText = errChunk && errChunk.type === 'text' ? errChunk.text : '';
    expect(errText).toMatch(/Unknown skill/);
    expect(errText).toContain('demo');
  });
});

const ext = {} as ExtensionContext;

function toolText(res: { content: { type: string; text?: string }[] }): string {
  const c = res.content[0];
  if (c?.type === 'text' && 'text' in c && typeof c.text === 'string') return c.text;
  return '';
}

describe('createTodoWriteTool', () => {
  it('stores todos and calls onTodos', async () => {
    const state: { current: TodoItem[] } = { current: [] };
    const onTodos = vi.fn();
    const tool = createTodoWriteTool(state, onTodos);
    const list: TodoItem[] = [
      { id: '1', task: 'first', status: 'pending' },
      { id: '2', task: 'second', status: 'in_progress' },
    ];
    await tool.execute('u1', { todos: list }, undefined, undefined, ext);
    expect(state.current).toEqual(list);
    expect(onTodos).toHaveBeenCalledWith(list);
  });

  it('replaces the entire list on each call', async () => {
    const state: { current: TodoItem[] } = { current: [] };
    const tool = createTodoWriteTool(state, vi.fn());
    await tool.execute(
      'u2',
      {
        todos: [{ id: '1', task: 'a', status: 'completed' }],
      },
      undefined,
      undefined,
      ext,
    );
    await tool.execute(
      'u3',
      {
        todos: [{ id: '2', task: 'b', status: 'pending' }],
      },
      undefined,
      undefined,
      ext,
    );
    expect(state.current).toHaveLength(1);
    expect(state.current[0]?.task).toBe('b');
  });

  it('uses status icons in summary text', async () => {
    const tool = createTodoWriteTool({ current: [] }, vi.fn());
    const res = await tool.execute(
      'u4',
      {
        todos: [
          { id: '1', task: 'p', status: 'pending' },
          { id: '2', task: 'w', status: 'in_progress' },
          { id: '3', task: 'd', status: 'completed' },
        ],
      },
      undefined,
      undefined,
      ext,
    );
    const t = toolText(res);
    expect(t).toContain('○ p');
    expect(t).toContain('● w');
    expect(t).toContain('✓ d');
  });

  it('allows empty todo list', async () => {
    const state: { current: TodoItem[] } = { current: [{ id: 'x', task: 'old', status: 'pending' }] };
    const tool = createTodoWriteTool(state, vi.fn());
    await tool.execute('u5', { todos: [] }, undefined, undefined, ext);
    expect(state.current).toEqual([]);
  });
});

describe('createValidateJsTool', () => {
  it('returns syntax OK for valid JS', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'app.js': 'const x = 1;\n' } });
    const tool = createValidateJsTool(bash);
    const res = await tool.execute('v1', { path: 'app.js' }, undefined, undefined, ext);
    expect(toolText(res)).toContain('syntax OK');
  });

  it('reports syntax errors', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'bad.js': 'const x = (' } });
    const tool = createValidateJsTool(bash);
    const res = await tool.execute('v2', { path: 'bad.js' }, undefined, undefined, ext);
    expect(toolText(res)).toMatch(/bad\.js:/);
    expect(toolText(res).toLowerCase()).not.toContain('syntax ok');
  });

  it('returns File not found for missing path', async () => {
    const bash = createAgentBashSandbox({});
    const tool = createValidateJsTool(bash);
    const res = await tool.execute('v3', { path: 'missing.js' }, undefined, undefined, ext);
    expect(toolText(res)).toMatch(/File not found/);
  });

  it('accepts empty file', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'empty.js': '' } });
    const tool = createValidateJsTool(bash);
    const res = await tool.execute('v4', { path: 'empty.js' }, undefined, undefined, ext);
    expect(toolText(res)).toContain('syntax OK');
  });

  it('accepts modern expression features the Script parser allows', async () => {
    const bash = createAgentBashSandbox({
      seedFiles: { 'm.js': 'const n = [1, 2, 3];\nconst y = n?.length;\n' },
    });
    const tool = createValidateJsTool(bash);
    const res = await tool.execute('v5', { path: 'm.js' }, undefined, undefined, ext);
    expect(toolText(res)).toContain('syntax OK');
  });
});

describe('createValidateHtmlTool structure', () => {
  const shellOk = `<!DOCTYPE html><html><head><title>t</title></head><body><p>Hi</p></body></html>`;

  it('passes minimal valid page with no external assets', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'index.html': shellOk } });
    const tool = createValidateHtmlTool(bash);
    const res = await tool.execute('h1', { path: 'index.html' }, undefined, undefined, ext);
    expect(toolText(res)).toContain('structure OK');
  });

  it('flags missing DOCTYPE', async () => {
    const html = '<html><head></head><body></body></html>';
    const bash = createAgentBashSandbox({ seedFiles: { 'index.html': html } });
    const tool = createValidateHtmlTool(bash);
    const res = await tool.execute('h2', { path: 'index.html' }, undefined, undefined, ext);
    expect(toolText(res)).toMatch(/DOCTYPE/i);
  });

  it('flags missing landmark tags', async () => {
    const html = '<!DOCTYPE html><html><head></head></html>';
    const bash = createAgentBashSandbox({ seedFiles: { 'index.html': html } });
    const tool = createValidateHtmlTool(bash);
    const res = await tool.execute('h3', { path: 'index.html' }, undefined, undefined, ext);
    expect(toolText(res)).toMatch(/body/i);
  });

  it('flags unbalanced script tags', async () => {
    const html = `<!DOCTYPE html><html><head><script>1</script><script>2</head><body></body></html>`;
    const bash = createAgentBashSandbox({ seedFiles: { 'index.html': html } });
    const tool = createValidateHtmlTool(bash);
    const res = await tool.execute('h4', { path: 'index.html' }, undefined, undefined, ext);
    expect(toolText(res)).toMatch(/Unbalanced <script>/i);
  });

  it('flags unbalanced style tags', async () => {
    const html = `<!DOCTYPE html><html><head><style>a{}</head><body></body></html>`;
    const bash = createAgentBashSandbox({ seedFiles: { 'index.html': html } });
    const tool = createValidateHtmlTool(bash);
    const res = await tool.execute('h5', { path: 'index.html' }, undefined, undefined, ext);
    expect(toolText(res)).toMatch(/Unbalanced <style>/i);
  });

  it('flags missing relative stylesheet', async () => {
    const html = `<!DOCTYPE html><html><head><link rel="stylesheet" href="missing.css"></head><body></body></html>`;
    const bash = createAgentBashSandbox({ seedFiles: { 'index.html': html } });
    const tool = createValidateHtmlTool(bash);
    const res = await tool.execute('h6', { path: 'index.html' }, undefined, undefined, ext);
    expect(toolText(res)).toMatch(/not found|missing\.css/i);
  });

  it('passes when relative stylesheet exists', async () => {
    const html = `<!DOCTYPE html><html><head><link rel="stylesheet" href="./styles.css"></head><body></body></html>`;
    const bash = createAgentBashSandbox({
      seedFiles: { 'index.html': html, 'styles.css': 'body{}' },
    });
    const tool = createValidateHtmlTool(bash);
    const res = await tool.execute('h7', { path: 'index.html' }, undefined, undefined, ext);
    expect(toolText(res)).toContain('structure OK');
  });

  it('flags root-absolute stylesheet href', async () => {
    const html = `<!DOCTYPE html><html><head><link rel="stylesheet" href="/styles.css"></head><body></body></html>`;
    const bash = createAgentBashSandbox({ seedFiles: { 'index.html': html } });
    const tool = createValidateHtmlTool(bash);
    const res = await tool.execute('h8', { path: 'index.html' }, undefined, undefined, ext);
    expect(toolText(res)).toMatch(/root-absolute|relative asset/i);
  });

  it('returns File not found for missing html path', async () => {
    const bash = createAgentBashSandbox({});
    const tool = createValidateHtmlTool(bash);
    const res = await tool.execute('h9', { path: 'ghost.html' }, undefined, undefined, ext);
    expect(toolText(res)).toMatch(/File not found/);
  });
});
