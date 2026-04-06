import { describe, it, expect, vi } from 'vitest';
import {
  createAgentBashSandbox,
  SANDBOX_PROJECT_ROOT,
} from '../../agent-bash-sandbox.ts';
import { createVirtualPiCodingTools } from '../virtual-tools.ts';
import type { ExtensionContext } from '../types.ts';

const noopCtx = {} as ExtensionContext;

function textOf(result: { content: { type: string; text?: string }[] }): string {
  const block = result.content.find((c) => c.type === 'text' && 'text' in c) as
    | { type: 'text'; text: string }
    | undefined;
  return block?.text ?? '';
}

function getTool(
  name: string,
  bash: ReturnType<typeof createAgentBashSandbox>,
  onFile: (path: string, content: string) => void = () => {},
) {
  const tools = createVirtualPiCodingTools(bash, onFile);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

async function exec(
  tool: ReturnType<typeof getTool>,
  params: Record<string, unknown>,
) {
  return tool.execute(
    `test-${Date.now()}`,
    params as never,
    undefined,
    undefined,
    noopCtx,
  );
}

describe('createVirtualPiCodingTools', () => {
  it('returns Pi-native tool names in SDK order', () => {
    const bash = createAgentBashSandbox({});
    const tools = createVirtualPiCodingTools(bash, () => {});
    expect(tools.map((t) => t.name)).toEqual(['read', 'write', 'edit', 'ls', 'find', 'grep']);
  });

  it('write and edit tools use sandbox-accurate descriptions (API schema)', () => {
    const bash = createAgentBashSandbox({});
    const tools = createVirtualPiCodingTools(bash, () => {});
    const write = tools.find((t) => t.name === 'write')!;
    const edit = tools.find((t) => t.name === 'edit')!;
    expect(write.description).toContain(SANDBOX_PROJECT_ROOT);
    expect(edit.description).toContain(SANDBOX_PROJECT_ROOT);
  });

  describe('read', () => {
    it('reads a seeded file from the virtual tree', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'hello.txt': 'world' } });
      const read = getTool('read', bash);
      const result = await exec(read, { path: 'hello.txt' });
      expect(textOf(result)).toContain('world');
    });

    it('reads a file at a nested path', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'src/components/Header.tsx': '<header>hi</header>' },
      });
      const read = getTool('read', bash);
      const result = await exec(read, { path: 'src/components/Header.tsx' });
      expect(textOf(result)).toContain('<header>hi</header>');
    });

    it('returns an error for a non-existent file', async () => {
      const bash = createAgentBashSandbox({});
      const read = getTool('read', bash);
      await expect(exec(read, { path: 'missing.txt' })).rejects.toThrow();
    });

    it('reads an empty file without error', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'empty.txt': '' } });
      const read = getTool('read', bash);
      const result = await exec(read, { path: 'empty.txt' });
      expect(result.content).toBeDefined();
    });

    it('supports offset and limit for pagination', async () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line-${i + 1}`).join('\n');
      const bash = createAgentBashSandbox({ seedFiles: { 'big.txt': lines } });
      const read = getTool('read', bash);
      const result = await exec(read, { path: 'big.txt', offset: 5, limit: 3 });
      const text = textOf(result);
      expect(text).toContain('line-5');
      expect(text).not.toContain('line-1');
    });

    it('reads a file using an absolute path', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'abs.txt': 'absolute content' } });
      const read = getTool('read', bash);
      const result = await exec(read, { path: `${SANDBOX_PROJECT_ROOT}/abs.txt` });
      expect(textOf(result)).toContain('absolute content');
    });

    it('truncates very large files at the line cap with continuation guidance', async () => {
      const lines = Array.from({ length: 2005 }, (_, i) => `L${i + 1}`).join('\n');
      const bash = createAgentBashSandbox({ seedFiles: { 'huge.txt': lines } });
      const read = getTool('read', bash);
      const result = await exec(read, { path: 'huge.txt' });
      const text = textOf(result);
      expect(text).toContain('L1');
      expect(text).toMatch(/2000|truncat|offset|limit|more/i);
    });

    it('errors when offset is beyond end of file', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'short.txt': 'a\nb' } });
      const read = getTool('read', bash);
      await expect(exec(read, { path: 'short.txt', offset: 99, limit: 1 })).rejects.toThrow();
    });
  });

  describe('write', () => {
    it('persists content and emits onDesignFile with project-relative path', async () => {
      const onFile = vi.fn();
      const bash = createAgentBashSandbox({});
      const write = getTool('write', bash, onFile);
      await exec(write, { path: 'out.txt', content: 'x' });
      const body = await bash.fs.readFile(`${SANDBOX_PROJECT_ROOT}/out.txt`, 'utf8');
      expect(body).toBe('x');
      expect(onFile).toHaveBeenCalledWith('out.txt', 'x');
    });

    it('creates nested directories automatically', async () => {
      const onFile = vi.fn();
      const bash = createAgentBashSandbox({});
      const write = getTool('write', bash, onFile);
      await exec(write, { path: 'a/b/c/deep.txt', content: 'nested' });
      const body = await bash.fs.readFile(`${SANDBOX_PROJECT_ROOT}/a/b/c/deep.txt`, 'utf8');
      expect(body).toBe('nested');
      expect(onFile).toHaveBeenCalledWith('a/b/c/deep.txt', 'nested');
    });

    it('overwrites an existing file', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'over.txt': 'old' } });
      const write = getTool('write', bash);
      await exec(write, { path: 'over.txt', content: 'new' });
      const body = await bash.fs.readFile(`${SANDBOX_PROJECT_ROOT}/over.txt`, 'utf8');
      expect(body).toBe('new');
    });
  });

  describe('edit', () => {
    it('applies a single search-and-replace edit', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'app.js': 'const x = 1;\nconsole.log(x);' },
      });
      const tools = createVirtualPiCodingTools(bash, () => {});
      const read = tools.find((t) => t.name === 'read')!;
      const edit = tools.find((t) => t.name === 'edit')!;
      await exec(read, { path: 'app.js' });
      const result = await exec(edit, {
        path: 'app.js',
        edits: [{ oldText: 'const x = 1;', newText: 'const count = 1;' }],
      });
      const body = await bash.fs.readFile(`${SANDBOX_PROJECT_ROOT}/app.js`, 'utf8');
      expect(body).toContain('const count = 1;');
      expect(body).toContain('console.log(x);');
      expect(textOf(result)).toBeTruthy();
    });

    it('applies multiple edits in one call', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'multi.txt': 'AAA\nBBB\nCCC' },
      });
      const tools = createVirtualPiCodingTools(bash, () => {});
      const read = tools.find((t) => t.name === 'read')!;
      const edit = tools.find((t) => t.name === 'edit')!;
      await exec(read, { path: 'multi.txt' });
      await exec(edit, {
        path: 'multi.txt',
        edits: [
          { oldText: 'AAA', newText: '111' },
          { oldText: 'CCC', newText: '333' },
        ],
      });
      const body = await bash.fs.readFile(`${SANDBOX_PROJECT_ROOT}/multi.txt`, 'utf8');
      expect(body).toBe('111\nBBB\n333');
    });

    it('emits onDesignFile after successful edit', async () => {
      const onFile = vi.fn();
      const bash = createAgentBashSandbox({ seedFiles: { 'cb.txt': 'before' } });
      const tools = createVirtualPiCodingTools(bash, onFile);
      const read = tools.find((t) => t.name === 'read')!;
      const edit = tools.find((t) => t.name === 'edit')!;
      await exec(read, { path: 'cb.txt' });
      await exec(edit, {
        path: 'cb.txt',
        edits: [{ oldText: 'before', newText: 'after' }],
      });
      expect(onFile).toHaveBeenCalledWith('cb.txt', 'after');
    });

    it('errors when oldText is not found in the file', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'nope.txt': 'hello world' } });
      const tools = createVirtualPiCodingTools(bash, () => {});
      const read = tools.find((t) => t.name === 'read')!;
      const edit = tools.find((t) => t.name === 'edit')!;
      await exec(read, { path: 'nope.txt' });
      await expect(
        exec(edit, {
          path: 'nope.txt',
          edits: [{ oldText: 'MISSING_STRING', newText: 'replacement' }],
        }),
      ).rejects.toThrow();
    });

    it('errors when oldText appears more than once', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'dup.txt': 'foo bar foo' } });
      const tools = createVirtualPiCodingTools(bash, () => {});
      const read = tools.find((t) => t.name === 'read')!;
      const edit = tools.find((t) => t.name === 'edit')!;
      await exec(read, { path: 'dup.txt' });
      await expect(
        exec(edit, {
          path: 'dup.txt',
          edits: [{ oldText: 'foo', newText: 'baz' }],
        }),
      ).rejects.toThrow();
    });

    it('errors when the file does not exist', async () => {
      const bash = createAgentBashSandbox({});
      const edit = getTool('edit', bash);
      await expect(
        exec(edit, {
          path: 'ghost.txt',
          edits: [{ oldText: 'any', newText: 'thing' }],
        }),
      ).rejects.toThrow();
    });

    it('requires read before editing an existing file', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'gate.txt': 'alpha' } });
      const tools = createVirtualPiCodingTools(bash, () => {});
      const edit = tools.find((t) => t.name === 'edit')!;
      await expect(
        exec(edit, {
          path: 'gate.txt',
          edits: [{ oldText: 'alpha', newText: 'beta' }],
        }),
      ).rejects.toThrow(/read .* before editing/i);
    });

    it('allows edit after write without a separate read (same session)', async () => {
      const bash = createAgentBashSandbox({});
      const tools = createVirtualPiCodingTools(bash, () => {});
      const write = tools.find((t) => t.name === 'write')!;
      const edit = tools.find((t) => t.name === 'edit')!;
      await exec(write, { path: 'fresh.txt', content: 'v1' });
      await exec(edit, {
        path: 'fresh.txt',
        edits: [{ oldText: 'v1', newText: 'v2' }],
      });
      const body = await bash.fs.readFile(`${SANDBOX_PROJECT_ROOT}/fresh.txt`, 'utf8');
      expect(body).toBe('v2');
    });

    it('requires read again after a successful edit before a second edit', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'twice.txt': 'one two' } });
      const tools = createVirtualPiCodingTools(bash, () => {});
      const read = tools.find((t) => t.name === 'read')!;
      const edit = tools.find((t) => t.name === 'edit')!;
      await exec(read, { path: 'twice.txt' });
      await exec(edit, {
        path: 'twice.txt',
        edits: [{ oldText: 'one', newText: 'ONE' }],
      });
      await expect(
        exec(edit, {
          path: 'twice.txt',
          edits: [{ oldText: 'two', newText: 'TWO' }],
        }),
      ).rejects.toThrow(/read .* before editing/i);
      await exec(read, { path: 'twice.txt' });
      await exec(edit, {
        path: 'twice.txt',
        edits: [{ oldText: 'two', newText: 'TWO' }],
      });
      const body = await bash.fs.readFile(`${SANDBOX_PROJECT_ROOT}/twice.txt`, 'utf8');
      expect(body).toBe('ONE TWO');
    });

    it('deletes text when newText is empty', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'del.txt': 'keep REMOVE keep' } });
      const tools = createVirtualPiCodingTools(bash, () => {});
      const read = tools.find((t) => t.name === 'read')!;
      const edit = tools.find((t) => t.name === 'edit')!;
      await exec(read, { path: 'del.txt' });
      await exec(edit, {
        path: 'del.txt',
        edits: [{ oldText: ' REMOVE', newText: '' }],
      });
      const body = await bash.fs.readFile(`${SANDBOX_PROJECT_ROOT}/del.txt`, 'utf8');
      expect(body).toBe('keep keep');
    });

    it('preserves content outside the edited region', async () => {
      const original = '// header\nconst a = 1;\n// footer';
      const bash = createAgentBashSandbox({ seedFiles: { 'preserve.js': original } });
      const tools = createVirtualPiCodingTools(bash, () => {});
      const read = tools.find((t) => t.name === 'read')!;
      const edit = tools.find((t) => t.name === 'edit')!;
      await exec(read, { path: 'preserve.js' });
      await exec(edit, {
        path: 'preserve.js',
        edits: [{ oldText: 'const a = 1;', newText: 'const a = 2;' }],
      });
      const body = await bash.fs.readFile(`${SANDBOX_PROJECT_ROOT}/preserve.js`, 'utf8');
      expect(body).toBe('// header\nconst a = 2;\n// footer');
    });

    it('match cascade retries edit when oldText has wrong indentation', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'indented.js': 'function f() {\n    return 1;\n}' },
      });
      const tools = createVirtualPiCodingTools(bash, () => {});
      const read = tools.find((t) => t.name === 'read')!;
      const edit = tools.find((t) => t.name === 'edit')!;
      await exec(read, { path: 'indented.js' });
      await exec(edit, {
        path: 'indented.js',
        edits: [
          {
            oldText: 'function f() {\n  return 1;\n}',
            newText: 'function f() {\n    return 2;\n}',
          },
        ],
      });
      const body = await bash.fs.readFile(`${SANDBOX_PROJECT_ROOT}/indented.js`, 'utf8');
      expect(body).toBe('function f() {\n    return 2;\n}');
    });
  });

  describe('ls', () => {
    it('lists files at the project root', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'index.html': '<h1>hi</h1>', 'style.css': 'body{}' },
      });
      const ls = getTool('ls', bash);
      const result = await exec(ls, { path: '.' });
      const text = textOf(result);
      expect(text).toContain('index.html');
      expect(text).toContain('style.css');
    });

    it('lists contents of a subdirectory', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'src/a.ts': 'a', 'src/b.ts': 'b', 'root.txt': 'r' },
      });
      const ls = getTool('ls', bash);
      const result = await exec(ls, { path: 'src' });
      const text = textOf(result);
      expect(text).toContain('a.ts');
      expect(text).toContain('b.ts');
      expect(text).not.toContain('root.txt');
    });

    it('shows directory entries with trailing slash', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'src/file.ts': 'x' },
      });
      const ls = getTool('ls', bash);
      const result = await exec(ls, { path: '.' });
      const text = textOf(result);
      expect(text).toMatch(/src\//);
    });

    it('shows dotfiles', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { '.env': 'SECRET=1', 'visible.txt': 'ok' },
      });
      const ls = getTool('ls', bash);
      const result = await exec(ls, { path: '.' });
      expect(textOf(result)).toContain('.env');
    });

    it('defaults to project root when path is omitted', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'root.txt': 'hi' } });
      const ls = getTool('ls', bash);
      const result = await exec(ls, {});
      expect(textOf(result)).toContain('root.txt');
    });

    it('reports empty directory', async () => {
      const bash = createAgentBashSandbox({});
      await bash.exec('mkdir -p empty_dir', {});
      const ls = getTool('ls', bash);
      const result = await exec(ls, { path: 'empty_dir' });
      expect(textOf(result)).toMatch(/empty directory/i);
    });

    it('errors for a non-existent path', async () => {
      const bash = createAgentBashSandbox({});
      const ls = getTool('ls', bash);
      await expect(exec(ls, { path: 'no_such_dir_xyz' })).rejects.toThrow();
    });
  });

  describe('find', () => {
    it('lists files matching glob under the project', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'src/a.ts': '//a', 'src/b.js': '//b' },
      });
      const find = getTool('find', bash);
      const result = await exec(find, { pattern: '**/*.ts', path: '.', limit: 100 });
      const text = textOf(result);
      expect(text).toMatch(/a\.ts/);
      expect(text).not.toMatch(/b\.js/);
    });

    it('returns no results for a pattern with no matches', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'index.html': '<html>' } });
      const find = getTool('find', bash);
      const result = await exec(find, { pattern: '**/*.py', path: '.', limit: 100 });
      const text = textOf(result);
      expect(text).not.toContain('.py');
    });

    it('matches dotfiles when pattern targets dot names', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { '.gitignore': 'node_modules', 'readme.md': 'hi' },
      });
      const find = getTool('find', bash);
      const result = await exec(find, { pattern: '**/.gitignore', path: '.', limit: 100 });
      expect(textOf(result)).toContain('.gitignore');
    });

    it('respects the limit parameter', async () => {
      const seeds: Record<string, string> = {};
      for (let i = 0; i < 10; i++) seeds[`file${i}.txt`] = `content ${i}`;
      const bash = createAgentBashSandbox({ seedFiles: seeds });
      const find = getTool('find', bash);
      const result = await exec(find, { pattern: '**/*.txt', path: '.', limit: 3 });
      const text = textOf(result);
      const matches = text.split('\n').filter((l) => l.includes('.txt'));
      expect(matches.length).toBeLessThanOrEqual(3);
    });

    it('finds files in deeply nested directories', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'a/b/c/d/deep.ts': 'found' },
      });
      const find = getTool('find', bash);
      const result = await exec(find, { pattern: '**/*.ts', path: '.', limit: 100 });
      expect(textOf(result)).toContain('deep.ts');
    });
  });

  describe('grep', () => {
    it('finds matches with file:line: output', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'lib/hi.txt': 'hello there' } });
      const grep = getTool('grep', bash);
      const result = await exec(grep, {
        pattern: 'hello',
        path: `${SANDBOX_PROJECT_ROOT}/lib/hi.txt`,
      });
      const text = textOf(result);
      expect(text).toContain('hello');
      expect(text).toMatch(/hi\.txt:\d+:/);
    });

    it('searches recursively across directories', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: {
          'src/a.ts': 'export const theme = "dark";',
          'src/b.ts': 'export const x = 1;',
        },
      });
      const grep = getTool('grep', bash);
      const result = await exec(grep, { pattern: 'theme', path: SANDBOX_PROJECT_ROOT });
      const text = textOf(result);
      expect(text).toMatch(/a\.ts/);
      expect(text).toContain('theme');
      expect(text).not.toMatch(/b\.ts/);
    });

    it('returns No matches found when pattern is absent', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'x.txt': 'alpha' } });
      const grep = getTool('grep', bash);
      const result = await exec(grep, {
        pattern: 'zzzz',
        path: `${SANDBOX_PROJECT_ROOT}/x.txt`,
      });
      expect(textOf(result)).toBe('No matches found');
    });

    it('respects --glob filter', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'one.ts': '// ts', 'two.js': '// ts match here' },
      });
      const grep = getTool('grep', bash);
      const result = await exec(grep, {
        pattern: 'ts',
        path: SANDBOX_PROJECT_ROOT,
        glob: '*.ts',
      });
      const text = textOf(result);
      expect(text).toMatch(/one\.ts/);
      expect(text).not.toMatch(/two\.js/);
    });

    it('supports ignoreCase', async () => {
      const bash = createAgentBashSandbox({ seedFiles: { 'c.txt': 'Hello MIXED' } });
      const grep = getTool('grep', bash);
      const result = await exec(grep, {
        pattern: 'hello',
        path: `${SANDBOX_PROJECT_ROOT}/c.txt`,
        ignoreCase: true,
      });
      expect(textOf(result)).toMatch(/Hello/);
    });

    it('includes context lines when context > 0', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'block.txt': 'line1\nMATCH_HERE\nline3' },
      });
      const grep = getTool('grep', bash);
      const result = await exec(grep, {
        pattern: 'MATCH_HERE',
        path: `${SANDBOX_PROJECT_ROOT}/block.txt`,
        context: 1,
      });
      const text = textOf(result);
      expect(text).toContain('MATCH_HERE');
      expect(text).toContain('line1');
      expect(text).toContain('line3');
    });

    it('returns Path not found for missing path', async () => {
      const bash = createAgentBashSandbox({});
      const grep = getTool('grep', bash);
      const result = await exec(grep, {
        pattern: 'x',
        path: `${SANDBOX_PROJECT_ROOT}/nope.txt`,
      });
      expect(textOf(result)).toMatch(/Path not found/);
    });

    it('supports the literal flag (regex metacharacters as literal text)', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'regex.txt': 'price is $10.00\nprice is 10000' },
      });
      const grep = getTool('grep', bash);
      const result = await exec(grep, {
        pattern: '$10.00',
        path: `${SANDBOX_PROJECT_ROOT}/regex.txt`,
        literal: true,
      });
      const text = textOf(result);
      expect(text).toContain('$10.00');
      expect(text).not.toContain('10000');
    });

    it('exposes sandbox-accurate description and literal/ignoreCase parameters', () => {
      const bash = createAgentBashSandbox({});
      const grep = getTool('grep', bash);
      expect(grep.description).toContain('in-memory');
      expect(grep.description).toMatch(/line numbers/i);
      const paramsJson = JSON.stringify(grep.parameters);
      expect(paramsJson).toContain('literal');
      expect(paramsJson).toContain('ignoreCase');
    });

    it('uses project root as default path when path is omitted', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'top.txt': 'findme' },
      });
      const grep = getTool('grep', bash);
      const result = await exec(grep, { pattern: 'findme' });
      expect(textOf(result)).toContain('findme');
    });

    it('appends notice when match limit is reached', async () => {
      const lines = Array.from({ length: 120 }, (_, i) => `MATCH line ${i}`).join('\n');
      const bash = createAgentBashSandbox({ seedFiles: { 'many.txt': lines } });
      const grep = getTool('grep', bash);
      const result = await exec(grep, {
        pattern: 'MATCH',
        path: `${SANDBOX_PROJECT_ROOT}/many.txt`,
        limit: 20,
      });
      const text = textOf(result);
      expect(text).toContain('20 matches limit reached');
    });

    it('notes when a matching line exceeds the char cap', async () => {
      const longLine = `needle ${'X'.repeat(600)}`;
      const bash = createAgentBashSandbox({ seedFiles: { 'wide.txt': longLine } });
      const grep = getTool('grep', bash);
      const result = await exec(grep, {
        pattern: 'needle',
        path: `${SANDBOX_PROJECT_ROOT}/wide.txt`,
      });
      const text = textOf(result);
      expect(text).toContain('needle');
      expect(text).toMatch(/truncated to 500 chars/i);
    });

    it('matches with regex alternation', async () => {
      const bash = createAgentBashSandbox({
        seedFiles: { 'rx.txt': 'cat dog bird' },
      });
      const grep = getTool('grep', bash);
      const result = await exec(grep, {
        pattern: 'cat|bird',
        path: `${SANDBOX_PROJECT_ROOT}/rx.txt`,
      });
      const text = textOf(result);
      expect(text).toMatch(/cat|bird/);
    });
  });
});
