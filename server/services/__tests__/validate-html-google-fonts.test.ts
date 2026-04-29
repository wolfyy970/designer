import { describe, expect, it } from 'vitest';
import type { Bash } from 'just-bash';
import { SANDBOX_PROJECT_ROOT } from '../virtual-workspace.ts';
import { createValidateHtmlTool } from '../pi-app-tools.ts';

function mockBash(files: Record<string, string>): Bash {
  const resolveRel = (abs: string): string | undefined => {
    const prefix = `${SANDBOX_PROJECT_ROOT}/`;
    if (!abs.startsWith(prefix)) return undefined;
    const rel = abs.slice(prefix.length);
    return rel in files ? rel : undefined;
  };
  return {
    fs: {
      exists: async (abs: string) => resolveRel(abs) !== undefined,
      stat: async (abs: string) => {
        if (resolveRel(abs) === undefined) throw new Error('ENOENT');
        return { isFile: true, isDirectory: false };
      },
      readFile: async (abs: string, _enc: string) => {
        const rel = resolveRel(abs);
        if (rel === undefined) throw new Error('ENOENT');
        return files[rel]!;
      },
    },
  } as Bash;
}

const shell = `<!DOCTYPE html><html><head>`;
const tail = `</head><body><p>Hi</p></body></html>`;

describe('validate_html Google Fonts allowlist', () => {
  async function runValidate(html: string) {
    const tool = createValidateHtmlTool(mockBash({ 'index.html': html }));
    const result = await tool.execute('tc', { path: 'index.html' }, undefined, undefined, {} as never);
    const first = result.content[0];
    const text = first?.type === 'text' ? first.text : '';
    return text;
  }

  it('passes Google Fonts link stylesheet', async () => {
    const html = `${shell}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans&display=swap">
<style>:root { font-family: 'DM Sans', sans-serif; }</style>
${tail}`;
    const text = await runValidate(html);
    expect(text).toContain('structure OK');
    expect(text).not.toContain('External asset reference');
  });

  it('flags non-Google external stylesheet', async () => {
    const html = `${shell}<link rel="stylesheet" href="https://evil.com/x.css">${tail}`;
    const text = await runValidate(html);
    expect(text).toContain('External asset reference found');
  });

  it('flags external script src', async () => {
    const html = `${shell}<script src="https://fonts.googleapis.com/jquery.js"></script></head><body></body></html>`;
    const text = await runValidate(html);
    expect(text).toContain('External asset reference found');
  });

  it('passes Google Fonts @import in style block', async () => {
    const html = `${shell}<style>
@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3');
body { font-family: 'Source Sans 3', sans-serif; }
</style>${tail}`;
    const text = await runValidate(html);
    expect(text).toContain('structure OK');
  });

  it('passes gstatic @import when used', async () => {
    const html = `${shell}<style>@import url("https://fonts.gstatic.com/s/roboto/v47/font-face.css");</style>${tail}`;
    const text = await runValidate(html);
    expect(text).toContain('structure OK');
  });

  it('flags evil @import in style block', async () => {
    const html = `${shell}<style>@import url('https://evil.com/font.css');</style>${tail}`;
    const text = await runValidate(html);
    expect(text).toContain('External @import in <style> not allowed');
  });

  it('resolves parent-relative href from a sub-page', async () => {
    const about = `${shell}<link rel="stylesheet" href="../css/style.css">${tail}`;
    const tool = createValidateHtmlTool(
      mockBash({
        'pages/about.html': about,
        'css/style.css': 'body{}',
      }),
    );
    const result = await tool.execute('tc', { path: 'pages/about.html' }, undefined, undefined, {} as never);
    const first = result.content[0];
    const text = first?.type === 'text' ? first.text : '';
    expect(text).toContain('structure OK');
    expect(text).not.toContain('not found');
  });

  it('resolves same-directory href from a sub-page', async () => {
    const sub = `${shell}<link rel="stylesheet" href="shared.css">${tail}`;
    const tool = createValidateHtmlTool(
      mockBash({
        'pages/sub.html': sub,
        'pages/shared.css': 'body{}',
      }),
    );
    const result = await tool.execute('tc', { path: 'pages/sub.html' }, undefined, undefined, {} as never);
    const first = result.content[0];
    const text = first?.type === 'text' ? first.text : '';
    expect(text).toContain('structure OK');
  });
});
