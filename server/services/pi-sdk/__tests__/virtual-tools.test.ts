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
});
