import { describe, it, expect } from 'vitest';
import { createAgentBashSandbox, SANDBOX_PROJECT_ROOT } from '../src/sandbox/virtual-workspace';
import { createVirtualPiCodingTools } from '../src/tools/virtual-tools';
import { createSandboxBashTool } from '../src/tools/bash-tool';
import type { ExtensionContext } from '../src/internal/pi-types';

const NO_OP_CTX = {} as ExtensionContext;

function findTool(tools: ReturnType<typeof createVirtualPiCodingTools>, name: string) {
  const t = tools.find((tool) => tool.name === name);
  if (!t) throw new Error(`tool ${name} missing`);
  return t;
}

describe('virtual-tools', () => {
  it('write+read round-trips a file under the sandbox root', async () => {
    const bash = createAgentBashSandbox();
    const writes: Array<{ rel: string; content: string }> = [];
    const tools = createVirtualPiCodingTools(bash, (rel, content) => writes.push({ rel, content }));
    const writeTool = findTool(tools, 'write');
    const readTool = findTool(tools, 'read');

    await writeTool.execute(
      'tc-1',
      { path: 'index.html', content: '<h1>hi</h1>' },
      undefined,
      undefined,
      NO_OP_CTX,
    );
    expect(writes).toEqual([{ rel: 'index.html', content: '<h1>hi</h1>' }]);

    const readResult = await readTool.execute(
      'tc-2',
      { path: 'index.html' },
      undefined,
      undefined,
      NO_OP_CTX,
    );
    const text = (readResult.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('<h1>hi</h1>');
  });

  it('read-before-edit invariant blocks an edit on an existing unread file', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'a.html': '<old>' } });
    const tools = createVirtualPiCodingTools(bash, () => {});
    const editTool = findTool(tools, 'edit');

    await expect(
      editTool.execute(
        'tc-3',
        {
          path: 'a.html',
          edits: [{ oldText: '<old>', newText: '<new>' }],
        },
        undefined,
        undefined,
        NO_OP_CTX,
      ),
    ).rejects.toThrow(/must read "a.html" before editing/);
  });

  it('edit succeeds after read on the same path', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'a.html': '<old>' } });
    const tools = createVirtualPiCodingTools(bash, () => {});
    const readTool = findTool(tools, 'read');
    const editTool = findTool(tools, 'edit');

    await readTool.execute('r1', { path: 'a.html' }, undefined, undefined, NO_OP_CTX);
    await editTool.execute(
      'e1',
      { path: 'a.html', edits: [{ oldText: '<old>', newText: '<new>' }] },
      undefined,
      undefined,
      NO_OP_CTX,
    );
    const after = await bash.fs.readFile(`${SANDBOX_PROJECT_ROOT}/a.html`, 'utf8');
    expect(after).toBe('<new>');
  });

  it('ls returns sandbox files and the bash tool reports their presence', async () => {
    const bash = createAgentBashSandbox({ seedFiles: { 'index.html': '<a>', 'app.css': 'a{}' } });
    const tools = createVirtualPiCodingTools(bash, () => {});
    const lsTool = findTool(tools, 'ls');
    const lsResult = await lsTool.execute('ls1', { path: '.' }, undefined, undefined, NO_OP_CTX);
    const lsText = (lsResult.content[0] as { type: 'text'; text: string }).text;
    expect(lsText).toContain('index.html');
    expect(lsText).toContain('app.css');

    const bashTool = createSandboxBashTool(bash, () => {});
    const bashResult = await bashTool.execute(
      'b1',
      { command: 'ls' },
      undefined,
      undefined,
      NO_OP_CTX,
    );
    const bashText = (bashResult.content[0] as { type: 'text'; text: string }).text;
    expect(bashText).toContain('index.html');
    expect(bashText).toContain('app.css');
  });
});
