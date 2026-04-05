import { describe, it, expect, vi } from 'vitest';
import {
  createAgentBashSandbox,
  SANDBOX_PROJECT_ROOT,
} from '../../agent-bash-sandbox.ts';
import { createVirtualPiCodingTools } from '../virtual-tools.ts';
import type { ExtensionContext } from '../types.ts';

const noopCtx = {} as ExtensionContext;

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

  it('read tool reads a seeded file from the virtual tree', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'hello.txt': 'world' } });
    const tools = createVirtualPiCodingTools(bash, () => {});
    const read = tools.find((t) => t.name === 'read')!;
    const result = await read.execute(
      'id1',
      { path: 'hello.txt' } as never,
      undefined,
      undefined,
      noopCtx,
    );
    const block = result.content.find((c) => c.type === 'text');
    expect(block).toBeDefined();
    expect(block && 'text' in block && block.text).toContain('world');
  });

  it('write tool persists content and emits onDesignFile with project-relative path', async () => {
    const onFile = vi.fn();
    const bash = createAgentBashSandbox({});
    const tools = createVirtualPiCodingTools(bash, onFile);
    const write = tools.find((t) => t.name === 'write')!;
    await write.execute(
      'id2',
      { path: 'out.txt', content: 'x' } as never,
      undefined,
      undefined,
      noopCtx,
    );
    const body = await bash.fs.readFile(`${SANDBOX_PROJECT_ROOT}/out.txt`, 'utf8');
    expect(body).toBe('x');
    expect(onFile).toHaveBeenCalledWith('out.txt', 'x');
  });

  it('find tool lists files matching glob under the project', async () => {
    const bash = createAgentBashSandbox({
      seedFiles: { 'src/a.ts': '//a', 'src/b.js': '//b' },
    });
    const tools = createVirtualPiCodingTools(bash, () => {});
    const find = tools.find((t) => t.name === 'find')!;
    const result = await find.execute(
      'id3',
      { pattern: '**/*.ts', path: '.', limit: 100 } as never,
      undefined,
      undefined,
      noopCtx,
    );
    const block = result.content[0];
    expect(block?.type).toBe('text');
    expect(block && 'text' in block && block.text).toMatch(/a\.ts/);
    expect(block && 'text' in block && block.text).not.toMatch(/b\.js/);
  });

  it('grep tool exposes sandbox-accurate description and literal/ignoreCase parameters', () => {
    const bash = createAgentBashSandbox({});
    const tools = createVirtualPiCodingTools(bash, () => {});
    const grep = tools.find((t) => t.name === 'grep')!;
    expect(grep.description).toContain('in-memory');
    expect(grep.description).toMatch(/line numbers/i);
    const paramsJson = JSON.stringify(grep.parameters);
    expect(paramsJson).toContain('literal');
    expect(paramsJson).toContain('ignoreCase');
  });

  it('grep tool finds matches with file:line: output', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'lib/hi.txt': 'hello there' } });
    const tools = createVirtualPiCodingTools(bash, () => {});
    const grep = tools.find((t) => t.name === 'grep')!;
    const result = await grep.execute(
      'g1',
      { pattern: 'hello', path: `${SANDBOX_PROJECT_ROOT}/lib/hi.txt` } as never,
      undefined,
      undefined,
      noopCtx,
    );
    const text = result.content.find((c) => c.type === 'text' && 'text' in c) as
      | { type: 'text'; text: string }
      | undefined;
    expect(text?.text).toContain('hello');
    expect(text?.text).toMatch(/hi\.txt:\d+:/);
  });

  it('grep tool searches recursively across directories', async () => {
    const bash = createAgentBashSandbox({
      seedFiles: { 'src/a.ts': 'export const theme = "dark";', 'src/b.ts': 'export const x = 1;' },
    });
    const tools = createVirtualPiCodingTools(bash, () => {});
    const grep = tools.find((t) => t.name === 'grep')!;
    const result = await grep.execute(
      'g2',
      { pattern: 'theme', path: SANDBOX_PROJECT_ROOT } as never,
      undefined,
      undefined,
      noopCtx,
    );
    const text = result.content.find((c) => c.type === 'text' && 'text' in c) as
      | { type: 'text'; text: string }
      | undefined;
    expect(text?.text).toMatch(/a\.ts/);
    expect(text?.text).toContain('theme');
    expect(text?.text).not.toMatch(/b\.ts/);
  });

  it('grep tool returns No matches found when pattern absent', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'x.txt': 'alpha' } });
    const tools = createVirtualPiCodingTools(bash, () => {});
    const grep = tools.find((t) => t.name === 'grep')!;
    const result = await grep.execute(
      'g3',
      { pattern: 'zzzz', path: `${SANDBOX_PROJECT_ROOT}/x.txt` } as never,
      undefined,
      undefined,
      noopCtx,
    );
    const text = result.content.find((c) => c.type === 'text' && 'text' in c) as
      | { type: 'text'; text: string }
      | undefined;
    expect(text?.text).toBe('No matches found');
  });

  it('grep tool respects --glob filter', async () => {
    const bash = createAgentBashSandbox({
      seedFiles: { 'one.ts': '// ts', 'two.js': '// ts match here' },
    });
    const tools = createVirtualPiCodingTools(bash, () => {});
    const grep = tools.find((t) => t.name === 'grep')!;
    const result = await grep.execute(
      'g4',
      { pattern: 'ts', path: SANDBOX_PROJECT_ROOT, glob: '*.ts' } as never,
      undefined,
      undefined,
      noopCtx,
    );
    const text = result.content.find((c) => c.type === 'text' && 'text' in c) as
      | { type: 'text'; text: string }
      | undefined;
    expect(text?.text).toMatch(/one\.ts/);
    expect(text?.text).not.toMatch(/two\.js/);
  });

  it('grep tool supports ignoreCase', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'c.txt': 'Hello MIXED' } });
    const tools = createVirtualPiCodingTools(bash, () => {});
    const grep = tools.find((t) => t.name === 'grep')!;
    const result = await grep.execute(
      'g5',
      { pattern: 'hello', path: `${SANDBOX_PROJECT_ROOT}/c.txt`, ignoreCase: true } as never,
      undefined,
      undefined,
      noopCtx,
    );
    const text = result.content.find((c) => c.type === 'text' && 'text' in c) as
      | { type: 'text'; text: string }
      | undefined;
    expect(text?.text).toMatch(/Hello/);
  });

  it('grep tool includes context lines when context > 0', async () => {
    const bash = createAgentBashSandbox({
      seedFiles: { 'block.txt': 'line1\nMATCH_HERE\nline3' },
    });
    const tools = createVirtualPiCodingTools(bash, () => {});
    const grep = tools.find((t) => t.name === 'grep')!;
    const result = await grep.execute(
      'g6',
      { pattern: 'MATCH_HERE', path: `${SANDBOX_PROJECT_ROOT}/block.txt`, context: 1 } as never,
      undefined,
      undefined,
      noopCtx,
    );
    const text = result.content.find((c) => c.type === 'text' && 'text' in c) as
      | { type: 'text'; text: string }
      | undefined;
    expect(text?.text).toContain('MATCH_HERE');
    expect(text?.text).toContain('line1');
    expect(text?.text).toContain('line3');
  });

  it('grep tool returns Path not found for missing path', async () => {
    const bash = createAgentBashSandbox({});
    const tools = createVirtualPiCodingTools(bash, () => {});
    const grep = tools.find((t) => t.name === 'grep')!;
    const result = await grep.execute(
      'g7',
      { pattern: 'x', path: `${SANDBOX_PROJECT_ROOT}/nope.txt` } as never,
      undefined,
      undefined,
      noopCtx,
    );
    const text = result.content.find((c) => c.type === 'text' && 'text' in c) as
      | { type: 'text'; text: string }
      | undefined;
    expect(text?.text).toMatch(/Path not found/);
  });
});
