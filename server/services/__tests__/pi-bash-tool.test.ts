import { describe, it, expect, vi } from 'vitest';
import { createAgentBashSandbox } from '../agent-bash-sandbox.ts';
import { createSandboxBashTool } from '../pi-bash-tool.ts';
import type { ExtensionContext } from '../pi-sdk/types.ts';

const ctx = {} as ExtensionContext;

describe('createSandboxBashTool', () => {
  it('runs echo and returns stdout', async () => {
    const bash = createAgentBashSandbox({});
    const tool = createSandboxBashTool(bash, vi.fn());
    const res = await tool.execute('t1', { command: 'echo hello' }, undefined, undefined, ctx);
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    expect(text).toContain('hello');
    expect(text).not.toMatch(/^\[exit /);
  });

  it('prefixes non-zero exit with [exit N]', async () => {
    const bash = createAgentBashSandbox({});
    const tool = createSandboxBashTool(bash, vi.fn());
    const res = await tool.execute('t2', { command: 'exit 7' }, undefined, undefined, ctx);
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    expect(text).toMatch(/^\[exit 7\]/);
  });

  it('fires onFile when bash creates a new project file', async () => {
    const onFile = vi.fn();
    const bash = createAgentBashSandbox({});
    const tool = createSandboxBashTool(bash, onFile);
    await tool.execute('t3', { command: 'echo x > new-from-bash.txt' }, undefined, undefined, ctx);
    expect(onFile).toHaveBeenCalled();
    const call = onFile.mock.calls.find((c) => c[0] === 'new-from-bash.txt');
    expect(call?.[1]).toContain('x');
  });

  it('fires onFile when bash modifies an existing file', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'data.txt': 'old' } });
    const onFile = vi.fn();
    const tool = createSandboxBashTool(bash, onFile);
    await tool.execute('t4', { command: "echo new > data.txt" }, undefined, undefined, ctx);
    expect(onFile).toHaveBeenCalledWith(
      'data.txt',
      expect.stringContaining('new'),
    );
  });

  it('does not call onFile when command leaves files unchanged', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'same.txt': 'fixed' } });
    const onFile = vi.fn();
    const tool = createSandboxBashTool(bash, onFile);
    await tool.execute('t5', { command: 'true' }, undefined, undefined, ctx);
    expect(onFile).not.toHaveBeenCalled();
  });

  it('returns (no output) for successful silent command', async () => {
    const bash = createAgentBashSandbox({});
    const tool = createSandboxBashTool(bash, vi.fn());
    const res = await tool.execute('t6', { command: 'true' }, undefined, undefined, ctx);
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    expect(text).toBe('(no output)');
  });

  it('returns (no stdout/stderr) for failing command with no streams', async () => {
    const bash = createAgentBashSandbox({});
    const tool = createSandboxBashTool(bash, vi.fn());
    const res = await tool.execute('t7', { command: 'exit 1' }, undefined, undefined, ctx);
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    expect(text).toMatch(/\[exit 1\]/);
    expect(text).toContain('(no stdout/stderr)');
  });

  it('truncates output at 51200 characters', async () => {
    const longBody = 'x'.repeat(60_000);
    const bash = createAgentBashSandbox({ seedFiles: { 'long.txt': longBody } });
    const tool = createSandboxBashTool(bash, vi.fn());
    const res = await tool.execute('t8', { command: 'cat long.txt' }, undefined, undefined, ctx);
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    expect(text.length).toBeLessThanOrEqual(51_200 + 80);
    expect(text).toContain('truncated at 51200');
  });

  it('rg works through bash', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'q.txt': 'findme' } });
    const tool = createSandboxBashTool(bash, vi.fn());
    const res = await tool.execute(
      't9',
      { command: 'rg findme q.txt' },
      undefined,
      undefined,
      ctx,
    );
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    expect(text).toContain('findme');
  });

  it('detects shell overwrite of an existing file', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 's.txt': 'OLD' } });
    const onFile = vi.fn();
    const tool = createSandboxBashTool(bash, onFile);
    await tool.execute('t10', { command: 'printf NEW > s.txt' }, undefined, undefined, ctx);
    expect(onFile).toHaveBeenCalled();
    const body = onFile.mock.calls.find((c) => c[0] === 's.txt')?.[1];
    expect(body).toContain('NEW');
  });

  it('emits each changed file when multiple files are written', async () => {
    const bash = createAgentBashSandbox({});
    const onFile = vi.fn();
    const tool = createSandboxBashTool(bash, onFile);
    await tool.execute(
      't11',
      { command: 'echo a > one.txt && echo b > two.txt' },
      undefined,
      undefined,
      ctx,
    );
    const paths = onFile.mock.calls.map((c) => c[0]).sort();
    expect(paths).toContain('one.txt');
    expect(paths).toContain('two.txt');
  });

  it('merges stderr into the tool text on failure', async () => {
    const bash = createAgentBashSandbox({});
    const tool = createSandboxBashTool(bash, vi.fn());
    const res = await tool.execute(
      't12',
      { command: 'ls /does-not-exist-xyz' },
      undefined,
      undefined,
      ctx,
    );
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    expect(text).toMatch(/\[exit /);
    expect(text.length).toBeGreaterThan(10);
  });
});

