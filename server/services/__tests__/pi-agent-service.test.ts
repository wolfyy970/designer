import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildModel,
  buildFallbackSummary,
  compactWithLLM,
  makeEditFileTool,
  makeListFilesTool,
  makeTodoWriteTool,
  makeGrepTool,
  makeValidateJsTool,
  makeValidateHtmlTool,
} from '../pi-agent-service.ts';
import type { TodoItem } from '../../../src/types/provider.ts';
import type { AgentMessage } from '@mariozechner/pi-agent-core';

vi.mock('../providers/registry.ts', () => ({
  getProvider: vi.fn(),
}));

import { getProvider } from '../providers/registry.ts';

// ── buildModel ──────────────────────────────────────────────────────────────

describe('buildModel', () => {
  describe('reasoning flag', () => {
    it('is false when thinkingLevel is undefined', () => {
      expect(buildModel('openrouter', 'some-model').reasoning).toBe(false);
    });

    it('is false when thinkingLevel is "off"', () => {
      expect(buildModel('openrouter', 'some-model', 'off').reasoning).toBe(false);
    });

    it('is true for "minimal"', () => {
      expect(buildModel('openrouter', 'some-model', 'minimal').reasoning).toBe(true);
    });

    it('is true for "low"', () => {
      expect(buildModel('openrouter', 'some-model', 'low').reasoning).toBe(true);
    });

    it('is true for "medium"', () => {
      expect(buildModel('openrouter', 'some-model', 'medium').reasoning).toBe(true);
    });

    it('is true for "high"', () => {
      expect(buildModel('openrouter', 'some-model', 'high').reasoning).toBe(true);
    });
  });

  describe('provider routing', () => {
    it('sets provider to lmstudio and uses LM Studio baseUrl', () => {
      const model = buildModel('lmstudio', 'qwen3-coder');
      expect(model.provider).toBe('lmstudio');
      expect(model.baseUrl).toMatch(/\/v1$/);
    });

    it('sets provider to openrouter and uses OpenRouter baseUrl', () => {
      const model = buildModel('openrouter', 'anthropic/claude-sonnet-4-5');
      expect(model.provider).toBe('openrouter');
      expect(model.baseUrl).toMatch(/\/api\/v1$/);
    });

    it('defaults to openrouter for unknown providerId', () => {
      expect(buildModel('unknown-provider', 'some-model').provider).toBe('openrouter');
    });
  });

  describe('model identity', () => {
    it('passes modelId through as id and name', () => {
      const model = buildModel('openrouter', 'anthropic/claude-3.5-sonnet', 'minimal');
      expect(model.id).toBe('anthropic/claude-3.5-sonnet');
      expect(model.name).toBe('anthropic/claude-3.5-sonnet');
    });
  });
});

// ── buildFallbackSummary ────────────────────────────────────────────────────

describe('buildFallbackSummary', () => {
  it('includes dropped count and file list', () => {
    const result = buildFallbackSummary(12, ['index.html', 'styles.css']);
    expect(result).toContain('12');
    expect(result).toContain('index.html');
    expect(result).toContain('styles.css');
  });

  it('handles empty file list gracefully', () => {
    const result = buildFallbackSummary(5, []);
    expect(result).toContain('none yet');
  });
});

// ── compactWithLLM ──────────────────────────────────────────────────────────

describe('compactWithLLM', () => {
  // Cast to AgentMessage[] — PI's assistant messages have array content in strict types,
  // but compactWithLLM just serializes them so the shape doesn't matter for this test.
  const messages = [
    { role: 'user', content: 'Write a bold landing page', timestamp: 1 },
    { role: 'user', content: 'I will write index.html first.', timestamp: 2 },
  ] as AgentMessage[];

  beforeEach(() => {
    vi.mocked(getProvider).mockReset();
  });

  it('returns fallback summary when provider is not found', async () => {
    vi.mocked(getProvider).mockReturnValue(undefined);
    const result = await compactWithLLM(messages, ['index.html'], 'openrouter', 'some-model');
    expect(result).toContain('index.html');
    expect(result).toContain('2'); // message count
  });

  it('returns LLM summary when provider call succeeds', async () => {
    vi.mocked(getProvider).mockReturnValue({
      generateChat: vi.fn().mockResolvedValue({ raw: 'LLM summary text', metadata: {} }),
    } as never);
    const result = await compactWithLLM(messages, ['index.html'], 'openrouter', 'some-model');
    expect(result).toBe('LLM summary text');
  });

  it('falls back to simple summary when provider call throws', async () => {
    vi.mocked(getProvider).mockReturnValue({
      generateChat: vi.fn().mockRejectedValue(new Error('network error')),
    } as never);
    const result = await compactWithLLM(messages, ['index.html'], 'openrouter', 'some-model');
    expect(result).toContain('index.html');
  });
});

// ── makeEditFileTool ────────────────────────────────────────────────────────

describe('makeEditFileTool', () => {
  function setup() {
    const virtualFS = new Map<string, string>();
    const onFile = vi.fn();
    const tool = makeEditFileTool(virtualFS, onFile);
    return { virtualFS, onFile, tool };
  }

  it('throws when file does not exist', async () => {
    const { tool } = setup();
    await expect(
      tool.execute('id', { path: 'missing.css', oldText: 'foo', newText: 'bar' }, undefined, undefined),
    ).rejects.toThrow('File not found');
  });

  it('throws when oldText is not found in the file', async () => {
    const { virtualFS, tool } = setup();
    virtualFS.set('styles.css', 'color: red;');
    await expect(
      tool.execute('id', { path: 'styles.css', oldText: 'color: blue;', newText: 'color: green;' }, undefined, undefined),
    ).rejects.toThrow('Text not found');
  });

  it('throws when oldText matches more than once', async () => {
    const { virtualFS, tool } = setup();
    virtualFS.set('styles.css', 'color: red; color: red;');
    await expect(
      tool.execute('id', { path: 'styles.css', oldText: 'color: red;', newText: 'color: blue;' }, undefined, undefined),
    ).rejects.toThrow('2 matches');
  });

  it('replaces text, updates virtualFS, and calls onFile', async () => {
    const { virtualFS, onFile, tool } = setup();
    virtualFS.set('styles.css', '--color-bg: #fff;');
    await tool.execute('id', { path: 'styles.css', oldText: '#fff', newText: '#0a0a0a' }, undefined, undefined);
    expect(virtualFS.get('styles.css')).toBe('--color-bg: #0a0a0a;');
    expect(onFile).toHaveBeenCalledWith('styles.css', '--color-bg: #0a0a0a;');
  });

  it('returns success message on edit', async () => {
    const { virtualFS, tool } = setup();
    virtualFS.set('index.html', '<title>Old</title>');
    const result = await tool.execute('id', { path: 'index.html', oldText: 'Old', newText: 'New' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('index.html');
  });
});

// ── makeListFilesTool ───────────────────────────────────────────────────────

describe('makeListFilesTool', () => {
  it('reports no files when virtualFS is empty', async () => {
    const tool = makeListFilesTool(new Map());
    const result = await tool.execute('id', {}, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('No files');
  });

  it('lists all files in virtualFS', async () => {
    const fs = new Map([['index.html', ''], ['styles.css', ''], ['app.js', '']]);
    const tool = makeListFilesTool(fs);
    const result = await tool.execute('id', {}, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('index.html');
    expect(text).toContain('styles.css');
    expect(text).toContain('app.js');
  });
});

// ── makeTodoWriteTool ───────────────────────────────────────────────────────

describe('makeTodoWriteTool', () => {
  function setup() {
    const todoState: { current: TodoItem[] } = { current: [] };
    const onTodos = vi.fn();
    const tool = makeTodoWriteTool(todoState, onTodos);
    return { todoState, onTodos, tool };
  }

  it('updates todoState.current with the provided todos', async () => {
    const { todoState, tool } = setup();
    const todos: TodoItem[] = [
      { id: '1', task: 'Write index.html', status: 'pending' },
      { id: '2', task: 'Write styles.css', status: 'in_progress' },
    ];
    await tool.execute('id', { todos }, undefined, undefined);
    expect(todoState.current).toEqual(todos);
  });

  it('calls onTodos with the provided todos', async () => {
    const { onTodos, tool } = setup();
    const todos: TodoItem[] = [{ id: '1', task: 'Write index.html', status: 'completed' }];
    await tool.execute('id', { todos }, undefined, undefined);
    expect(onTodos).toHaveBeenCalledWith(todos);
  });

  it('returns a formatted summary with status icons', async () => {
    const { tool } = setup();
    const todos: TodoItem[] = [
      { id: '1', task: 'Write index.html', status: 'completed' },
      { id: '2', task: 'Write styles.css', status: 'in_progress' },
      { id: '3', task: 'Write app.js', status: 'pending' },
    ];
    const result = await tool.execute('id', { todos }, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('✓ Write index.html');
    expect(text).toContain('● Write styles.css');
    expect(text).toContain('○ Write app.js');
  });
});

// ── makeGrepTool ────────────────────────────────────────────────────────────

describe('makeGrepTool', () => {
  function setup(files: Record<string, string> = {}) {
    const virtualFS = new Map(Object.entries(files));
    const tool = makeGrepTool(virtualFS);
    return { virtualFS, tool };
  }

  it('returns no matches message when nothing matches', async () => {
    const { tool } = setup({ 'styles.css': 'color: red;' });
    const result = await tool.execute('id', { pattern: 'background-color' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('No matches found');
  });

  it('returns a match with correct file:line: format', async () => {
    const { tool } = setup({ 'styles.css': '--color-bg: #fff;\n--color-fg: #000;' });
    const result = await tool.execute('id', { pattern: '#fff' }, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('styles.css:1:');
    expect(text).toContain('--color-bg: #fff;');
  });

  it('searches across multiple files', async () => {
    const { tool } = setup({
      'styles.css': '--color-accent: #f00;',
      'index.html': '<div class="accent">',
    });
    const result = await tool.execute('id', { pattern: 'accent' }, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('styles.css');
    expect(text).toContain('index.html');
  });

  it('scopes search to a single file when path is provided', async () => {
    const { tool } = setup({
      'styles.css': 'color: red;',
      'app.js': 'color: red;',
    });
    const result = await tool.execute('id', { pattern: 'color', path: 'styles.css' }, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('styles.css');
    expect(text).not.toContain('app.js');
  });

  it('returns error result (not throw) for invalid regex', async () => {
    const { tool } = setup({ 'styles.css': 'color: red;' });
    const result = await tool.execute('id', { pattern: '[invalid' }, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Invalid regex pattern');
  });

  it('reports correct line numbers', async () => {
    const { tool } = setup({ 'styles.css': 'line1\nline2\ncolor: blue;\nline4' });
    const result = await tool.execute('id', { pattern: 'color' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('styles.css:3:');
  });

  it('caps results at 50 matches', async () => {
    const lines = Array.from({ length: 60 }, (_, i) => `color: #${i.toString().padStart(3, '0')};`);
    const { tool } = setup({ 'styles.css': lines.join('\n') });
    const result = await tool.execute('id', { pattern: 'color' }, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    const matchCount = text.split('\n').filter((l) => l.startsWith('styles.css:')).length;
    expect(matchCount).toBe(50);
    expect(text).toContain('[50 match limit reached]');
  });
});

// ── buildFallbackSummary with todos ────────────────────────────────────────

describe('buildFallbackSummary with todos', () => {
  it('appends todo list when todos are provided', () => {
    const todos: TodoItem[] = [
      { id: '1', task: 'Write index.html', status: 'completed' },
      { id: '2', task: 'Write styles.css', status: 'pending' },
    ];
    const result = buildFallbackSummary(5, ['index.html'], todos);
    expect(result).toContain('[Current todo list at time of compaction]');
    expect(result).toContain('✓ [completed] Write index.html');
    expect(result).toContain('○ [pending] Write styles.css');
  });

  it('omits todo appendix when todos array is empty', () => {
    const result = buildFallbackSummary(5, ['index.html'], []);
    expect(result).not.toContain('[Current todo list');
  });

  it('omits todo appendix when todos is undefined', () => {
    const result = buildFallbackSummary(5, ['index.html']);
    expect(result).not.toContain('[Current todo list');
  });
});

// ── makeValidateJsTool ──────────────────────────────────────────────────────

describe('makeValidateJsTool', () => {
  it('returns syntax OK for valid JS', async () => {
    const fs = new Map([['app.js', 'const x = 1;\nconsole.log(x);']]);
    const tool = makeValidateJsTool(fs);
    const result = await tool.execute('id', { path: 'app.js' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('syntax OK');
  });

  it('returns error message with line info for invalid JS', async () => {
    const fs = new Map([['app.js', 'const x = {']]);
    const tool = makeValidateJsTool(fs);
    const result = await tool.execute('id', { path: 'app.js' }, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('app.js:');
    expect(text).not.toContain('syntax OK');
  });

  it('returns file not found for missing file', async () => {
    const tool = makeValidateJsTool(new Map());
    const result = await tool.execute('id', { path: 'missing.js' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('File not found');
  });

  it('handles modern JS features without false positives', async () => {
    const code = [
      'const fn = async () => {',
      '  const { a, ...rest } = await Promise.resolve({ a: 1, b: 2 });',
      '  return rest;',
      '};',
    ].join('\n');
    const fs = new Map([['app.js', code]]);
    const tool = makeValidateJsTool(fs);
    const result = await tool.execute('id', { path: 'app.js' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('syntax OK');
  });
});

// ── makeValidateHtmlTool ────────────────────────────────────────────────────

const VALID_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <h1>Hello</h1>
  <script src="app.js" defer></script>
</body>
</html>`;

describe('makeValidateHtmlTool', () => {
  it('returns structure OK for valid HTML', async () => {
    const fs = new Map([['index.html', VALID_HTML]]);
    const tool = makeValidateHtmlTool(fs);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('structure OK');
  });

  it('reports missing DOCTYPE', async () => {
    const html = VALID_HTML.replace('<!DOCTYPE html>\n', '');
    const fs = new Map([['index.html', html]]);
    const tool = makeValidateHtmlTool(fs);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('DOCTYPE');
  });

  it('reports missing body tag', async () => {
    const html = VALID_HTML.replace('<body>', '').replace('</body>', '');
    const fs = new Map([['index.html', html]]);
    const tool = makeValidateHtmlTool(fs);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('<body>');
  });

  it('reports unbalanced script tags', async () => {
    const html = VALID_HTML.replace('</script>', '');
    const fs = new Map([['index.html', html]]);
    const tool = makeValidateHtmlTool(fs);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('Unbalanced <script>');
  });

  it('reports inline style content', async () => {
    const html = VALID_HTML.replace('</head>', '<style>body { color: red; }</style>\n</head>');
    const fs = new Map([['index.html', html]]);
    const tool = makeValidateHtmlTool(fs);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('Inline <style>');
  });

  it('reports inline script content', async () => {
    const html = VALID_HTML.replace('</body>', '<script>alert(1);</script>\n</body>');
    const fs = new Map([['index.html', html]]);
    const tool = makeValidateHtmlTool(fs);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('Inline <script>');
  });

  it('reports missing styles.css reference', async () => {
    const html = VALID_HTML.replace('<link rel="stylesheet" href="styles.css">', '');
    const fs = new Map([['index.html', html]]);
    const tool = makeValidateHtmlTool(fs);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('styles.css');
  });

  it('reports missing app.js reference', async () => {
    const html = VALID_HTML.replace('<script src="app.js" defer></script>', '');
    const fs = new Map([['index.html', html]]);
    const tool = makeValidateHtmlTool(fs);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('app.js');
  });

  it('returns file not found for missing file', async () => {
    const tool = makeValidateHtmlTool(new Map());
    const result = await tool.execute('id', { path: 'missing.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('File not found');
  });

  it('does not flag script src tag as inline script', async () => {
    const fs = new Map([['index.html', VALID_HTML]]);
    const tool = makeValidateHtmlTool(fs);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).not.toContain('Inline <script>');
  });
});
