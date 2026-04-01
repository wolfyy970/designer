import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildModel,
  buildFallbackSummary,
  compactWithLLM,
  makeEditFileTool,
  makeLsTool,
  makeFindTool,
  makeReadFileTool,
  makeTodoWriteTool,
  makeGrepTool,
  makeValidateJsTool,
  makeValidateHtmlTool,
  VirtualWorkspace,
} from '../pi-agent-service.ts';
import type { TodoItem } from '../../../src/types/provider.ts';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { WorkspaceFileSnapshot } from '../virtual-workspace.ts';

vi.mock('../providers/registry.ts', () => ({
  getProvider: vi.fn(),
}));

import { getProvider } from '../providers/registry.ts';

function snap(partial: Partial<WorkspaceFileSnapshot> = {}): WorkspaceFileSnapshot {
  return {
    allPaths: [],
    readFiles: [],
    modifiedFiles: [],
    ...partial,
  };
}

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
  it('includes dropped count and modified file list', () => {
    const result = buildFallbackSummary(
      12,
      snap({ modifiedFiles: ['index.html', 'styles.css'], allPaths: ['index.html', 'styles.css'] }),
    );
    expect(result).toContain('12');
    expect(result).toContain('index.html');
    expect(result).toContain('styles.css');
  });

  it('handles empty modified list gracefully', () => {
    const result = buildFallbackSummary(5, snap());
    expect(result).toContain('none yet');
  });
});

// ── compactWithLLM ──────────────────────────────────────────────────────────

describe('compactWithLLM', () => {
  const messages = [
    { role: 'user', content: 'Write a bold landing page', timestamp: 1 },
    { role: 'user', content: 'I will write index.html first.', timestamp: 2 },
  ] as AgentMessage[];

  beforeEach(() => {
    vi.mocked(getProvider).mockReset();
  });

  it('returns fallback summary when provider is not found', async () => {
    vi.mocked(getProvider).mockReturnValue(undefined);
    const result = await compactWithLLM(messages, 'openrouter', 'some-model', {
      snapshot: snap({ modifiedFiles: ['index.html'] }),
    });
    expect(result).toContain('index.html');
    expect(result).toContain('2');
  });

  it('returns LLM summary when provider call succeeds', async () => {
    vi.mocked(getProvider).mockReturnValue({
      generateChat: vi.fn().mockResolvedValue({ raw: 'LLM summary text', metadata: {} }),
    } as never);
    const result = await compactWithLLM(messages, 'openrouter', 'some-model', {
      snapshot: snap({ modifiedFiles: ['index.html'] }),
    });
    expect(result).toBe('LLM summary text');
  });

  it('falls back to simple summary when provider call throws', async () => {
    vi.mocked(getProvider).mockReturnValue({
      generateChat: vi.fn().mockRejectedValue(new Error('network error')),
    } as never);
    const result = await compactWithLLM(messages, 'openrouter', 'some-model', {
      snapshot: snap({ modifiedFiles: ['index.html'] }),
    });
    expect(result).toContain('index.html');
  });
});

// ── makeEditFileTool ────────────────────────────────────────────────────────

describe('makeEditFileTool', () => {
  function setup() {
    const workspace = new VirtualWorkspace();
    const onFile = vi.fn();
    const tool = makeEditFileTool(workspace, onFile);
    return { workspace, onFile, tool };
  }

  it('throws when file does not exist', async () => {
    const { tool } = setup();
    await expect(
      tool.execute('id', { path: 'missing.css', oldText: 'foo', newText: 'bar' }, undefined, undefined),
    ).rejects.toThrow('File not found');
  });

  it('throws when oldText is not found in the file', async () => {
    const { workspace, tool } = setup();
    workspace.seed('styles.css', 'color: red;');
    await expect(
      tool.execute(
        'id',
        { path: 'styles.css', oldText: 'color: blue;', newText: 'color: green;' },
        undefined,
        undefined,
      ),
    ).rejects.toThrow('Text not found');
  });

  it('throws when oldText matches more than once', async () => {
    const { workspace, tool } = setup();
    workspace.seed('styles.css', 'color: red; color: red;');
    await expect(
      tool.execute('id', { path: 'styles.css', oldText: 'color: red;', newText: 'color: blue;' }, undefined, undefined),
    ).rejects.toThrow('2 matches');
  });

  it('replaces text, updates workspace, and calls onFile', async () => {
    const { workspace, onFile, tool } = setup();
    workspace.seed('styles.css', '--color-bg: #fff;');
    await tool.execute('id', { path: 'styles.css', oldText: '#fff', newText: '#0a0a0a' }, undefined, undefined);
    expect(workspace.get('styles.css')).toBe('--color-bg: #0a0a0a;');
    expect(onFile).toHaveBeenCalledWith('styles.css', '--color-bg: #0a0a0a;');
  });

  it('applies batched edits in one call', async () => {
    const { workspace, onFile, tool } = setup();
    workspace.seed('app.js', 'const a = 1;\nconst b = 2;\n');
    await tool.execute(
      'id',
      {
        path: 'app.js',
        edits: [
          { oldText: 'const a = 1;', newText: 'const a = 10;' },
          { oldText: 'const b = 2;', newText: 'const b = 20;' },
        ],
      },
      undefined,
      undefined,
    );
    expect(workspace.get('app.js')).toBe('const a = 10;\nconst b = 20;\n');
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it('returns success message on edit', async () => {
    const { workspace, tool } = setup();
    workspace.seed('index.html', '<title>Old</title>');
    const result = await tool.execute('id', { path: 'index.html', oldText: 'Old', newText: 'New' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('index.html');
  });
});

// ── makeLsTool ──────────────────────────────────────────────────────────────

describe('makeLsTool', () => {
  it('reports empty workspace', async () => {
    const tool = makeLsTool(new VirtualWorkspace());
    const result = await tool.execute('id', {}, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('empty workspace');
  });

  it('lists all paths in workspace', async () => {
    const ws = new VirtualWorkspace();
    ws.seed('index.html', '');
    ws.seed('styles.css', '');
    ws.seed('app.js', '');
    const tool = makeLsTool(ws);
    const result = await tool.execute('id', {}, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('index.html');
    expect(text).toContain('styles.css');
    expect(text).toContain('app.js');
  });
});

// ── makeFindTool ────────────────────────────────────────────────────────────

describe('makeFindTool', () => {
  it('returns matching paths for a glob', async () => {
    const ws = new VirtualWorkspace();
    ws.seed('deep/x.html', '');
    ws.seed('styles.css', '');
    const tool = makeFindTool(ws);
    const result = await tool.execute('id', { pattern: '**/*.html' }, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('deep/x.html');
    expect(text).not.toContain('styles.css');
  });

  it('reports when nothing matches', async () => {
    const ws = new VirtualWorkspace();
    ws.seed('a.js', '');
    const tool = makeFindTool(ws);
    const result = await tool.execute('id', { pattern: '*.css' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('No paths match');
  });
});

// ── makeReadFileTool ────────────────────────────────────────────────────────

describe('makeReadFileTool', () => {
  it('returns a numbered slice with offset and limit', async () => {
    const ws = new VirtualWorkspace();
    ws.seed('f.txt', 'l1\nl2\nl3\nl4');
    const tool = makeReadFileTool(ws);
    const result = await tool.execute('id', { path: 'f.txt', offset: 2, limit: 2 }, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('2|l2');
    expect(text).toContain('3|l3');
    expect(text).not.toContain('1|l1');
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
    const workspace = new VirtualWorkspace();
    for (const [path, content] of Object.entries(files)) {
      workspace.seed(path, content);
    }
    const tool = makeGrepTool(workspace);
    return { workspace, tool };
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
    expect(text).toMatch(/styles\.css:1[>:]/);
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
    expect(text).toContain('Invalid pattern');
  });

  it('reports correct line numbers', async () => {
    const { tool } = setup({ 'styles.css': 'line1\nline2\ncolor: blue;\nline4' });
    const result = await tool.execute('id', { pattern: 'color' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toMatch(/styles\.css:3[>:]/);
  });

  it('caps results at limit matches', async () => {
    const lines = Array.from({ length: 60 }, (_, i) => `color: #${i.toString().padStart(3, '0')};`);
    const { tool } = setup({ 'styles.css': lines.join('\n') });
    const result = await tool.execute('id', { pattern: 'color', limit: 50 }, undefined, undefined);
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
    const result = buildFallbackSummary(5, snap({ modifiedFiles: ['index.html'] }), todos);
    expect(result).toContain('[Current todo list at time of compaction]');
    expect(result).toContain('✓ [completed] Write index.html');
    expect(result).toContain('○ [pending] Write styles.css');
  });

  it('omits todo appendix when todos array is empty', () => {
    const result = buildFallbackSummary(5, snap({ modifiedFiles: ['index.html'] }), []);
    expect(result).not.toContain('[Current todo list');
  });

  it('omits todo appendix when todos is undefined', () => {
    const result = buildFallbackSummary(5, snap({ modifiedFiles: ['index.html'] }));
    expect(result).not.toContain('[Current todo list');
  });
});

// ── makeValidateJsTool ──────────────────────────────────────────────────────

describe('makeValidateJsTool', () => {
  it('returns syntax OK for valid JS', async () => {
    const ws = new VirtualWorkspace();
    ws.seed('app.js', 'const x = 1;\nconsole.log(x);');
    const tool = makeValidateJsTool(ws);
    const result = await tool.execute('id', { path: 'app.js' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('syntax OK');
  });

  it('returns error message with line info for invalid JS', async () => {
    const ws = new VirtualWorkspace();
    ws.seed('app.js', 'const x = {');
    const tool = makeValidateJsTool(ws);
    const result = await tool.execute('id', { path: 'app.js' }, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('app.js:');
    expect(text).not.toContain('syntax OK');
  });

  it('returns file not found for missing file', async () => {
    const tool = makeValidateJsTool(new VirtualWorkspace());
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
    const ws = new VirtualWorkspace();
    ws.seed('app.js', code);
    const tool = makeValidateJsTool(ws);
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

function seedHtmlWorkspace(html = VALID_HTML): VirtualWorkspace {
  const ws = new VirtualWorkspace();
  ws.seed('index.html', html);
  ws.seed('styles.css', 'body { color: red; }');
  ws.seed('app.js', 'console.log("ok");');
  return ws;
}

describe('makeValidateHtmlTool', () => {
  it('returns structure OK for valid HTML', async () => {
    const ws = seedHtmlWorkspace();
    const tool = makeValidateHtmlTool(ws);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('structure OK');
  });

  it('reports missing DOCTYPE', async () => {
    const html = VALID_HTML.replace('<!DOCTYPE html>\n', '');
    const ws = seedHtmlWorkspace(html);
    const tool = makeValidateHtmlTool(ws);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('DOCTYPE');
  });

  it('reports missing body tag', async () => {
    const html = VALID_HTML.replace('<body>', '').replace('</body>', '');
    const ws = seedHtmlWorkspace(html);
    const tool = makeValidateHtmlTool(ws);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('<body>');
  });

  it('reports unbalanced script tags', async () => {
    const html = VALID_HTML.replace('</script>', '');
    const ws = seedHtmlWorkspace(html);
    const tool = makeValidateHtmlTool(ws);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('Unbalanced <script>');
  });

  it('reports inline style content', async () => {
    const html = VALID_HTML.replace('</head>', '<style>body { color: red; }</style>\n</head>');
    const ws = seedHtmlWorkspace(html);
    const tool = makeValidateHtmlTool(ws);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('Inline <style>');
  });

  it('reports inline script content', async () => {
    const html = VALID_HTML.replace('</body>', '<script>alert(1);</script>\n</body>');
    const ws = seedHtmlWorkspace(html);
    const tool = makeValidateHtmlTool(ws);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('Inline <script>');
  });

  it('allows arbitrary local asset filenames', async () => {
    const html = VALID_HTML
      .replace('styles.css', 'theme/base.css')
      .replace('app.js', 'scripts/entry.mjs');
    const ws = seedHtmlWorkspace(html);
    ws.seed('theme/base.css', 'body { color: blue; }');
    ws.seed('scripts/entry.mjs', 'console.log("mjs");');
    const tool = makeValidateHtmlTool(ws);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('structure OK');
  });

  it('reports missing referenced assets instead of hardcoded filenames', async () => {
    const html = VALID_HTML
      .replace('styles.css', 'theme/missing.css')
      .replace('app.js', 'scripts/missing.js');
    const ws = seedHtmlWorkspace(html);
    const tool = makeValidateHtmlTool(ws);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('theme/missing.css');
    expect(text).toContain('scripts/missing.js');
  });

  it('reports external asset references', async () => {
    const html = VALID_HTML.replace('styles.css', 'https://cdn.example.com/styles.css');
    const ws = seedHtmlWorkspace(html);
    const tool = makeValidateHtmlTool(ws);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('External asset reference');
  });

  it('returns file not found for missing file', async () => {
    const tool = makeValidateHtmlTool(new VirtualWorkspace());
    const result = await tool.execute('id', { path: 'missing.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).toContain('File not found');
  });

  it('does not flag script src tag as inline script', async () => {
    const ws = seedHtmlWorkspace();
    const tool = makeValidateHtmlTool(ws);
    const result = await tool.execute('id', { path: 'index.html' }, undefined, undefined);
    expect((result.content[0] as { text: string }).text).not.toContain('Inline <script>');
  });
});
