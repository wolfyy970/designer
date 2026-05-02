import { describe, it, expect } from 'vitest';
import { createAgentBashSandbox, sandboxProjectAbsPath } from '../src/sandbox/virtual-workspace';
import {
  createTodoWriteTool,
  createValidateHtmlTool,
  createValidateJsTool,
} from '../src/extension/designer-tools';
import type { ExtensionContext } from '../src/internal/pi-types';
import type { TodoItem } from '../src/types';

const NO_OP_CTX = {} as ExtensionContext;

describe('todo_write', () => {
  it('replaces the todo state and emits to onTodos', async () => {
    const todoState: { current: TodoItem[] } = { current: [] };
    const emitted: TodoItem[][] = [];
    const tool = createTodoWriteTool(todoState, (t) => emitted.push(t));
    const newTodos: TodoItem[] = [
      { id: '1', task: 'design home page', status: 'pending' },
      { id: '2', task: 'write copy', status: 'in_progress' },
    ];
    const result = await tool.execute(
      'tc',
      { todos: newTodos },
      undefined,
      undefined,
      NO_OP_CTX,
    );
    expect(todoState.current).toEqual(newTodos);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual(newTodos);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('○ design home page');
    expect(text).toContain('● write copy');
  });
});

describe('validate_js', () => {
  it('returns "syntax OK" for valid JS', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'app.js': 'function f(){return 1;} f();' } });
    const tool = createValidateJsTool(bash);
    const result = await tool.execute('tc', { path: 'app.js' }, undefined, undefined, NO_OP_CTX);
    expect((result.content[0] as { text: string }).text).toMatch(/syntax OK/);
  });

  it('reports a syntax error message for broken JS', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'bad.js': 'function f({' } });
    const tool = createValidateJsTool(bash);
    const result = await tool.execute('tc', { path: 'bad.js' }, undefined, undefined, NO_OP_CTX);
    const text = (result.content[0] as { text: string }).text;
    expect(text.startsWith('bad.js: ')).toBe(true);
    expect(text).not.toMatch(/syntax OK/);
  });

  it('reports file not found when path is absent', async () => {
    const bash = createAgentBashSandbox();
    const tool = createValidateJsTool(bash);
    const result = await tool.execute('tc', { path: 'missing.js' }, undefined, undefined, NO_OP_CTX);
    expect((result.content[0] as { text: string }).text).toBe('File not found: missing.js');
  });
});

describe('validate_html', () => {
  it('returns "structure OK" for a minimal valid page', async () => {
    const bash = createAgentBashSandbox({
      seedFiles: {
        'index.html': '<!DOCTYPE html><html><head></head><body><h1>hi</h1></body></html>',
      },
    });
    const tool = createValidateHtmlTool(bash);
    const result = await tool.execute('tc', { path: 'index.html' }, undefined, undefined, NO_OP_CTX);
    expect((result.content[0] as { text: string }).text).toMatch(/structure OK/);
  });

  it('flags missing DOCTYPE and missing tags', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'a.html': '<h1>no doctype</h1>' } });
    const tool = createValidateHtmlTool(bash);
    const result = await tool.execute('tc', { path: 'a.html' }, undefined, undefined, NO_OP_CTX);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Missing DOCTYPE');
    expect(text).toContain('Missing <html>');
  });

  it('flags external script refs but accepts Google Fonts stylesheet links', async () => {
    const html =
      '<!DOCTYPE html><html><head>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Inter">' +
      '</head><body><script src="https://cdn.example.com/x.js"></script></body></html>';
    const bash = createAgentBashSandbox({ seedFiles: { 'index.html': html } });
    const tool = createValidateHtmlTool(bash);
    const result = await tool.execute('tc', { path: 'index.html' }, undefined, undefined, NO_OP_CTX);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('External asset reference found: https://cdn.example.com/x.js');
    expect(text).not.toContain('External asset reference found: https://fonts.googleapis.com');
  });

  it('flags missing referenced local assets', async () => {
    const bash = createAgentBashSandbox({
      seedFiles: {
        'index.html':
          '<!DOCTYPE html><html><head><link rel="stylesheet" href="missing.css"></head><body></body></html>',
      },
    });
    const tool = createValidateHtmlTool(bash);
    const result = await tool.execute('tc', { path: 'index.html' }, undefined, undefined, NO_OP_CTX);
    expect((result.content[0] as { text: string }).text).toContain('Referenced asset not found');
  });

  it('accepts referenced local assets that exist in the workspace', async () => {
    const bash = createAgentBashSandbox({
      seedFiles: {
        'index.html':
          '<!DOCTYPE html><html><head><link rel="stylesheet" href="app.css"></head><body></body></html>',
        'app.css': 'body{}',
      },
    });
    // sanity: confirm the seed map prefixed both files
    expect(await bash.fs.exists(sandboxProjectAbsPath('app.css'))).toBe(true);
    const tool = createValidateHtmlTool(bash);
    const result = await tool.execute('tc', { path: 'index.html' }, undefined, undefined, NO_OP_CTX);
    expect((result.content[0] as { text: string }).text).toMatch(/structure OK/);
  });
});
