/**
 * Opt-in integration tests: set SANDBOX_LLM_TEST=1 and OPENROUTER_API_KEY_TESTS
 * (dedicated test key — not OPENROUTER_API_KEY). Model id: MODEL_SELECTOR, else SANDBOX_LLM_MODEL, else gpt-4o-mini.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { discoverSkills, resolveSkillsRoot } from '../../lib/skill-discovery.ts';
import type { SkillCatalogEntry } from '../../lib/skill-schema.ts';
import { SANDBOX_LLM_SYSTEM_PREFIX, runSandboxToolConversation } from './sandbox-llm-harness.ts';

const live = process.env.SANDBOX_LLM_TEST === '1';

/** OpenRouter model id for sandbox LLM tests; SANDBOX_LLM_MODEL remains a legacy alias. */
function sandboxLlmModel(): string {
  const fromSelector = process.env.MODEL_SELECTOR?.trim();
  if (fromSelector) return fromSelector;
  const legacy = process.env.SANDBOX_LLM_MODEL?.trim();
  if (legacy) return legacy;
  return 'openai/gpt-4o-mini';
}

describe.skipIf(!live)('sandbox LLM tool scenarios (OpenRouter)', () => {
  let repoSkills: SkillCatalogEntry[] = [];

  beforeAll(async () => {
    repoSkills = await discoverSkills(resolveSkillsRoot());
  }, 30_000);

  const sys = SANDBOX_LLM_SYSTEM_PREFIX;
  const model = sandboxLlmModel();

  it(
    'read: model reads readme.txt with the read tool',
    async () => {
      const { toolCalls } = await runSandboxToolConversation({
        seedFiles: { 'readme.txt': 'SECRET_README_TOKEN_42' },
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt: 'What exact text is inside readme.txt? Use the read tool once; answer with the file contents only.',
        model,
        maxToolRounds: 6,
      });
      const read = toolCalls.find((c) => c.name === 'read');
      expect(read).toBeDefined();
      expect(String(read?.args.path ?? '')).toMatch(/readme\.txt/);
      expect(read?.resultPreview).toContain('SECRET_README_TOKEN_42');
    },
    120_000,
  );

  it(
    'write: model creates index.html',
    async () => {
      const { toolCalls, files } = await runSandboxToolConversation({
        seedFiles: {},
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt:
          'Create a minimal valid index.html in the project root with a single h1 "Hello". Use the write tool.',
        model,
        maxToolRounds: 8,
      });
      const usedWrite = toolCalls.some((c) => c.name === 'write');
      expect(usedWrite || 'index.html' in files).toBe(true);
      const html = files['index.html'] ?? '';
      expect(html.toLowerCase()).toContain('<h1');
      expect(html).toMatch(/Hello/i);
    },
    120_000,
  );

  it(
    'edit: model renames variable with edit tool',
    async () => {
      const { toolCalls, files } = await runSandboxToolConversation({
        // Unique token appears once — avoids duplicate-match and delicate whitespace in multi-token renames.
        seedFiles: { 'app.js': 'const message = "SANDBOX_EDIT_TOKEN_XY7";\n' },
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt:
          'Read app.js with the read tool, then use the edit tool once: oldText must be exactly SANDBOX_EDIT_TOKEN_XY7 and newText exactly HELLO_INSIDE_STRING (tool JSON keys are oldText and newText). Do not use bash.',
        model,
        maxToolRounds: 8,
      });
      expect(toolCalls.some((c) => c.name === 'edit')).toBe(true);
      expect(files['app.js'] ?? '').toContain('HELLO_INSIDE_STRING');
    },
    120_000,
  );

  it(
    'ls: model lists src directory',
    async () => {
      const seeds: Record<string, string> = {};
      for (let i = 1; i <= 5; i++) seeds[`src/f${i}.txt`] = `${i}`;
      const { toolCalls } = await runSandboxToolConversation({
        seedFiles: seeds,
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt: 'List the files in the src directory using the ls tool. How many .txt files do you see?',
        model,
        maxToolRounds: 6,
      });
      const ls = toolCalls.find((c) => c.name === 'ls');
      expect(ls).toBeDefined();
      expect(String(ls?.args.path ?? '')).toMatch(/src/);
    },
    120_000,
  );

  it(
    'find: model finds TypeScript files',
    async () => {
      const { toolCalls } = await runSandboxToolConversation({
        seedFiles: {
          'a.ts': '//a',
          'b.js': '//b',
          'sub/c.ts': '//c',
        },
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt: 'Use the find tool to list all .ts files in the project (glob **/*.ts).',
        model,
        maxToolRounds: 6,
      });
      expect(toolCalls.some((c) => c.name === 'find')).toBe(true);
    },
    120_000,
  );

  it(
    'grep: model searches for TODO',
    async () => {
      const { toolCalls } = await runSandboxToolConversation({
        seedFiles: {
          'one.txt': 'ok',
          'two.txt': '// TODO fix this',
          'three.txt': 'fine',
        },
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt: 'Search the project for TODO comments using the grep tool.',
        model,
        maxToolRounds: 6,
      });
      const g = toolCalls.find((c) => c.name === 'grep');
      expect(g).toBeDefined();
      expect(String(g?.args.pattern ?? '').toUpperCase()).toContain('TODO');
    },
    120_000,
  );

  it(
    'bash: model counts lines in data.txt',
    async () => {
      const lines = Array.from({ length: 7 }, (_, i) => `line ${i + 1}`).join('\n');
      const { toolCalls } = await runSandboxToolConversation({
        seedFiles: { 'data.txt': lines },
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt:
          'How many lines are in data.txt? Use the bash tool with wc -l (or similar) on data.txt.',
        model,
        maxToolRounds: 6,
      });
      expect(toolCalls.some((c) => c.name === 'bash')).toBe(true);
    },
    120_000,
  );

  it(
    'todo_write: model records tasks',
    async () => {
      const { toolCalls } = await runSandboxToolConversation({
        seedFiles: {},
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt:
          'Use todo_write to set exactly two tasks: id "1" task "build header" pending, id "2" task "add styles" in_progress.',
        model,
        maxToolRounds: 6,
      });
      const tw = toolCalls.find((c) => c.name === 'todo_write');
      expect(tw).toBeDefined();
      const todos = tw?.args.todos as { id?: string; task?: string }[] | undefined;
      expect(Array.isArray(todos)).toBe(true);
      expect(todos!.length).toBeGreaterThanOrEqual(2);
    },
    120_000,
  );

  it(
    'use_skill: model loads accessibility skill',
    async () => {
      const a11y = repoSkills.find((s) => s.key === 'accessibility');
      expect(a11y, 'repo must include skills/accessibility').toBeDefined();
      const { toolCalls } = await runSandboxToolConversation({
        seedFiles: {},
        skillCatalog: repoSkills.filter((s) => s.key === 'accessibility'),
        systemPrompt: sys,
        userPrompt:
          'Activate the accessibility skill with use_skill (skill key accessibility). Summarize one rule from the body in one sentence.',
        model,
        maxToolRounds: 6,
      });
      const us = toolCalls.find((c) => c.name === 'use_skill');
      expect(us).toBeDefined();
      expect(String(us?.args.name ?? '')).toMatch(/accessibility/i);
    },
    120_000,
  );

  it(
    'validate_js: model validates broken file',
    async () => {
      const { toolCalls } = await runSandboxToolConversation({
        seedFiles: { 'app.js': 'const x = (' },
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt: 'Run validate_js on app.js and report whether syntax is OK.',
        model,
        maxToolRounds: 6,
      });
      expect(toolCalls.some((c) => c.name === 'validate_js')).toBe(true);
    },
    120_000,
  );

  it(
    'validate_html: model checks bad html',
    async () => {
      const { toolCalls } = await runSandboxToolConversation({
        seedFiles: { 'index.html': '<html><body>no doctype</body></html>' },
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt: 'Run validate_html on index.html.',
        model,
        maxToolRounds: 6,
      });
      expect(toolCalls.some((c) => c.name === 'validate_html')).toBe(true);
    },
    120_000,
  );

  it(
    'multi-step: validate missing stylesheet then create it',
    async () => {
      const html = `<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body><p>x</p></body></html>`;
      const { toolCalls, files } = await runSandboxToolConversation({
        seedFiles: { 'index.html': html },
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt:
          'index.html references styles.css but the file is missing. First run validate_html on index.html, then create styles.css with body { margin: 0; } using the write tool.',
        model,
        maxToolRounds: 12,
      });
      expect(toolCalls.some((c) => c.name === 'validate_html')).toBe(true);
      expect(toolCalls.some((c) => c.name === 'write')).toBe(true);
      expect(files['styles.css'] ?? '').toMatch(/margin/);
    },
    180_000,
  );

  /**
   * Build a stylesheet whose first `read` (no offset) hits Pi’s ~50KB head truncation
   * so the model must use offset/limit (or equivalent) to reach the tail rule.
   */
  function cssWithOversizedHeadPadding(): string {
    const lines: string[] = [];
    const footer = '\n.sandbox-far-target { outline: SANDBOX_FAR_READ_BUG_Q3; }\n';
    for (let i = 0; ; i++) {
      lines.push(`/* pad ${i} */ ${'x'.repeat(64)}`);
      const body = lines.join('\n') + footer;
      if (Buffer.byteLength(body, 'utf8') >= 52 * 1024) {
        return body;
      }
      if (i > 4000) {
        throw new Error('failed to build oversized CSS fixture');
      }
    }
  }

  /*
   * ── Duplicate-token disambiguation ───────────────────────────────────────────
   *
   * The same placeholder appears in multiple rules; instructions require changing
   * **only** `.hero-title` padding. Short oldText would trigger duplicate-match
   * errors — the model must widen context to the full rule (selector + braces).
   */
  it(
    'stress: replace duplicated token only inside .hero-title',
    async () => {
      const ambigueCss = [
        '.nav-item { padding: CONTENT__DUPE__Z9; }',
        '.footer-link { margin: CONTENT__DUPE__Z9; }',
        '.hero-title {',
        '  font-size: 2rem;',
        '  padding: CONTENT__DUPE__Z9;',
        '}',
        '.sidebar { gap: CONTENT__DUPE__Z9; }',
      ].join('\n');

      const { toolCalls, files } = await runSandboxToolConversation({
        seedFiles: { 'css/ambigue.css': ambigueCss },
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt: [
          'Project file: css/ambigue.css (do not rename the file).',
          '',
          'CONTENT__DUPE__Z9 appears in several selectors. You must change **only** the `.hero-title` rule:',
          'replace its `padding: CONTENT__DUPE__Z9;` with `padding: 2rem;`.',
          'Leave every other occurrence of CONTENT__DUPE__Z9 unchanged.',
          '',
          'Use read/edit tools. If edit fails because the match is not unique, include the full `.hero-title { … }` block in oldText.',
        ].join('\n'),
        model,
        maxToolRounds: 18,
      });

      const usedRead = toolCalls.some((c) => c.name === 'read');
      const usedEdit = toolCalls.some(
        (c) => c.name === 'edit' && JSON.stringify(c.args).includes('ambigue'),
      );
      expect(usedRead, 'should read the stylesheet').toBe(true);
      expect(usedEdit, 'should edit css/ambigue.css').toBe(true);

      const finalCss = files['css/ambigue.css'] ?? '';
      expect(finalCss).not.toBe('');
      const dupCount = (finalCss.match(/CONTENT__DUPE__Z9/g) ?? []).length;
      expect(dupCount, 'three other occurrences must remain').toBe(3);

      const heroRule = finalCss.match(/\.hero-title\s*\{[^}]*\}/);
      expect(heroRule, 'hero rule block present').toBeTruthy();
      expect(heroRule![0], 'hero block gets 2rem padding only').toMatch(/padding:\s*2rem/);
      expect(heroRule![0]).not.toContain('CONTENT__DUPE__Z9');
    },
    300_000,
  );

  /*
   * ── Large-file read pagination ───────────────────────────────────────────────
   *
   * First read of css/huge.css exceeds the head byte limit; the target rule is at
   * the end. The model must paginate (offset/limit) or otherwise locate the tail.
   */
  it(
    'stress: fix tail rule in oversized css after truncated first read',
    async () => {
      const hugeCss = cssWithOversizedHeadPadding();
      expect(Buffer.byteLength(hugeCss, 'utf8')).toBeGreaterThan(50 * 1024);

      const { toolCalls, files } = await runSandboxToolConversation({
        seedFiles: { 'css/huge.css': hugeCss },
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt: [
          'File: css/huge.css. It is large; a single read may truncate before the end.',
          '',
          'The **last** rule in the file is `.sandbox-far-target`. It contains an invalid placeholder value SANDBOX_FAR_READ_BUG_Q3 in the outline declaration.',
          'Replace that value so the declaration reads: `outline: 2px solid crimson;`',
          'Use read with offset/limit as needed, then edit. Do not delete unrelated padding comments.',
        ].join('\n'),
        model,
        maxToolRounds: 24,
      });

      const finalCss = files['css/huge.css'] ?? '';
      expect(finalCss).not.toBe('');
      expect(finalCss).not.toContain('SANDBOX_FAR_READ_BUG_Q3');

      const tailRule = finalCss.match(/\.sandbox-far-target\s*\{[^}]*\}/);
      expect(tailRule, '.sandbox-far-target block must exist').toBeTruthy();
      const block = tailRule![0].toLowerCase();
      expect(block).toMatch(/outline/);
      expect(block).toContain('2px');
      expect(block).toContain('solid');
      expect(
        block.includes('crimson') ||
          block.includes('#dc143c') ||
          /rgb\s*\(\s*220\s*,\s*20\s*,\s*60\s*\)/.test(block),
        'outline color should be crimson (keyword, #dc143c, or rgb(220,20,60))',
      ).toBe(true);

      const hugeReads = toolCalls.filter(
        (c) =>
          c.name === 'read' &&
          (JSON.stringify(c.args).includes('huge.css') ||
            JSON.stringify(c.args).includes('css/huge.css')),
      );
      expect(hugeReads.length, 'should read huge.css at least once').toBeGreaterThanOrEqual(1);
      const usedPagination =
        hugeReads.some((c) => typeof (c.args as { offset?: unknown }).offset === 'number') ||
        hugeReads.length >= 2;
      expect(
        usedPagination,
        'should paginate read (offset) or read again after truncation hint',
      ).toBe(true);
    },
    360_000,
  );

  /*
   * ── Realistic revision scenario ──────────────────────────────────────────────
   *
   * Models a REAL revision round: the model gets eval feedback describing
   * problems, but **no file contents** in its context window. It must orient
   * itself (ls/find/read), understand the existing code, and fix the issues.
   *
   * Seeds a ~100-line multi-file dashboard app (HTML + CSS + JS) with two
   * planted issues that mirror real agentic-eval feedback:
   *
   *   1. CSS defines custom properties at :root but body/card/button rules use
   *      hardcoded hex colors instead of var(--…). Some hex values appear in
   *      multiple rules (realistic duplication), forcing the model to include
   *      enough surrounding context in oldText to disambiguate edits.
   *   2. A TODO comment marks where a mobile breakpoint should be, but none exists.
   *
   * Assertions verify outcomes, not prescribed workflow:
   *   • Model oriented itself (explored the project)
   *   • Model investigated the CSS (read or grep — had to, since contents
   *     were not in its context)
   *   • Model modified the CSS (edit preferred; write acceptable as fallback)
   *   • Final CSS uses var(--…) instead of hardcoded hex (≥3 replacements)
   *   • Final CSS contains an @media query (mobile breakpoint added)
   */
  it(
    'revision scenario: discover → grep → edit hardcoded colors + add mobile breakpoint',
    async () => {
      // ── Seed files ─────────────────────────────────────────────────────────
      const indexHtml = [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="UTF-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '  <title>Metric Dashboard</title>',
        '  <link rel="stylesheet" href="css/styles.css">',
        '</head>',
        '<body>',
        '  <nav class="top-bar">',
        '    <span class="logo">Metrics</span>',
        '    <button class="cta">Export</button>',
        '  </nav>',
        '  <main class="grid">',
        '    <section class="card" id="users-card">',
        '      <h2>Active Users</h2>',
        '      <p class="metric" id="user-count">—</p>',
        '    </section>',
        '    <section class="card" id="revenue-card">',
        '      <h2>Revenue</h2>',
        '      <p class="metric" id="revenue">—</p>',
        '    </section>',
        '    <section class="card" id="errors-card">',
        '      <h2>Error Rate</h2>',
        '      <p class="metric" id="error-rate">—</p>',
        '    </section>',
        '  </main>',
        '  <script src="js/app.js"></script>',
        '</body>',
        '</html>',
      ].join('\n');

      // CSS: custom properties defined at :root, but NOT used below — hardcoded
      // hex values appear instead. This is the planted issue.
      // INTENTIONALLY includes duplicate hex values across rules (e.g. #16213e
      // in .top-bar AND .card, #eaeaea in body AND .logo AND .cta) — realistic
      // for real CSS. The model must include enough surrounding context in
      // oldText to make each edit unique, and recover if the tool rejects a
      // non-unique match.
      const stylesCss = [
        ':root {',
        '  --color-bg: #1a1a2e;',
        '  --color-surface: #16213e;',
        '  --color-accent: #e94560;',
        '  --color-text: #eaeaea;',
        '  --color-muted: #8a8a9b;',
        '  --radius: 12px;',
        '}',
        '',
        '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
        '',
        'body {',
        '  font-family: "Inter", system-ui, sans-serif;',
        '  background: #1a1a2e;',
        '  color: #eaeaea;',
        '  min-height: 100vh;',
        '}',
        '',
        '.top-bar {',
        '  display: flex;',
        '  align-items: center;',
        '  justify-content: space-between;',
        '  padding: 1rem 2rem;',
        '  background: #16213e;',
        '}',
        '',
        '.logo { font-weight: 700; font-size: 1.25rem; color: #eaeaea; }',
        '',
        '.cta {',
        '  background: #e94560;',
        '  color: #eaeaea;',
        '  border: none;',
        '  padding: 0.5rem 1.5rem;',
        '  border-radius: 12px;',
        '  cursor: pointer;',
        '  font-weight: 600;',
        '}',
        '.cta:hover { opacity: 0.85; }',
        '',
        '.grid {',
        '  display: grid;',
        '  grid-template-columns: repeat(3, 1fr);',
        '  gap: 1.5rem;',
        '  padding: 2rem;',
        '}',
        '',
        '.card {',
        '  background: #16213e;',
        '  border-radius: 12px;',
        '  padding: 2rem;',
        '}',
        '',
        '.card h2 { font-size: 0.85rem; text-transform: uppercase; color: #8a8a9b; }',
        '.card .metric { font-size: 2.5rem; font-weight: 700; margin-top: 0.5rem; }',
        '',
        '/* TODO: add mobile breakpoint — cards should stack on narrow screens */',
      ].join('\n');

      const appJs = [
        'document.addEventListener("DOMContentLoaded", () => {',
        '  const data = {',
        '    users: 12_847,',
        '    revenue: 384_290,',
        '    errorRate: 0.27,',
        '  };',
        '',
        '  function formatNumber(n) {',
        '    return n.toLocaleString("en-US");',
        '  }',
        '',
        '  function formatCurrency(n) {',
        '    return "$" + n.toLocaleString("en-US");',
        '  }',
        '',
        '  function formatPercent(n) {',
        '    return (n * 100).toFixed(1) + "%";',
        '  }',
        '',
        '  const userEl = document.getElementById("user-count");',
        '  const revEl = document.getElementById("revenue");',
        '  const errEl = document.getElementById("error-rate");',
        '',
        '  if (userEl) userEl.textContent = formatNumber(data.users);',
        '  if (revEl) revEl.textContent = formatCurrency(data.revenue);',
        '  if (errEl) errEl.textContent = formatPercent(data.errorRate);',
        '',
        '  const exportBtn = document.querySelector(".cta");',
        '  if (exportBtn) {',
        '    exportBtn.addEventListener("click", () => {',
        '      const ts = new Date().toISOString().slice(0, 10);',
        '      const csv = [',
        '        "metric,value",',
        '        `users,${data.users}`,',
        '        `revenue,${data.revenue}`,',
        '        `error_rate,${data.errorRate}`,',
        '      ].join("\\n");',
        '      const blob = new Blob([csv], { type: "text/csv" });',
        '      const a = document.createElement("a");',
        '      a.href = URL.createObjectURL(blob);',
        '      a.download = `metrics-${ts}.csv`;',
        '      a.click();',
        '    });',
        '  }',
        '});',
      ].join('\n');

      // ── Run ────────────────────────────────────────────────────────────────
      // User prompt models REAL eval feedback: describes problems, not file
      // contents. The model does NOT have the file content in its context
      // window — it must orient itself by exploring the project, reading
      // files, then making changes. This mirrors how revision rounds work
      // in production (new Pi session, files in sandbox, only eval feedback
      // in the user message).
      const { toolCalls, files } = await runSandboxToolConversation({
        seedFiles: {
          'index.html': indexHtml,
          'css/styles.css': stylesCss,
          'js/app.js': appJs,
        },
        skillCatalog: repoSkills,
        systemPrompt: sys,
        userPrompt: [
          'You are revising an existing multi-file design based on evaluation feedback.',
          '',
          'Evaluation findings:',
          '- **Color tokens not adopted:** The stylesheet defines CSS custom properties at :root, but the rest of the rules use hardcoded hex color values instead of referencing them with var(). Replace hardcoded hex colors with the appropriate var(--…) tokens.',
          '- **No responsive layout:** The card grid has no mobile breakpoint. Add an @media query so cards stack into a single column on narrow viewports.',
          '',
          'Start by exploring the project to understand its structure, then read the stylesheet to see which custom properties exist and where hardcoded values appear. Apply targeted edits. If an edit is rejected because the text is not unique, include more surrounding lines in oldText to disambiguate.',
        ].join('\n'),
        model,
        maxToolRounds: 20,
      });

      // ── Assertions ─────────────────────────────────────────────────────────
      // Check OUTCOMES. The model has no file contents in context — it must
      // discover, read, then modify. We verify it investigated before editing
      // and that the final CSS is correct.

      // 1. Orientation: the model must have explored the project since no
      //    file paths or contents were given in the prompt.
      const usedOrientation = toolCalls.some(
        (c) => c.name === 'ls' || c.name === 'find' || c.name === 'read',
      );
      expect(usedOrientation, 'should orient by exploring the project (ls/find/read)').toBe(true);

      // 2. Investigation: specifically read or grepped the CSS (needs to see
      //    :root and the hardcoded values to know what to replace)
      const usedInvestigation = toolCalls.some(
        (c) =>
          (c.name === 'grep' || c.name === 'read') &&
          JSON.stringify(c.args).includes('css'),
      );
      expect(usedInvestigation, 'should read or grep the stylesheet').toBe(true);

      // 3. Modified the CSS. edit is preferred (surgical); write is acceptable
      //    if the model chose a full rewrite after struggling with duplicate
      //    oldText matches — either strategy can produce a correct result.
      const cssModified = toolCalls.some(
        (c) =>
          (c.name === 'edit' || c.name === 'write') &&
          JSON.stringify(c.args).includes('css'),
      );
      expect(cssModified, 'should edit or write the stylesheet').toBe(true);

      // 4. Final CSS replaces hardcoded hex with var(--…).
      //    The seed has 8 hardcoded hex values outside :root (some duplicated
      //    across rules). We require ≥3 var(--…) usages to prove real work.
      const finalCss = files['css/styles.css'] ?? '';
      expect(finalCss, 'CSS file should still exist').not.toBe('');
      const varUsages = (finalCss.match(/var\(--/g) ?? []).length;
      expect(
        varUsages,
        `should replace some hardcoded hex with var(--…); found ${varUsages} usages`,
      ).toBeGreaterThanOrEqual(3);

      // 5. Mobile breakpoint added
      expect(
        finalCss,
        'should contain an @media query for mobile',
      ).toMatch(/@media\b/);
    },
    300_000,
  );
});
