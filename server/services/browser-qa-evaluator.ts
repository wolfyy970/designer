/**
 * Deterministic browser-backed QA evaluator.
 *
 * No LLM call — this worker analyses the bundled HTML and runs JavaScript
 * inside a Node VM sandbox to catch runtime errors that static analysis misses.
 *
 * Rubric criteria (each scored 1–5):
 *   page_structure    — DOCTYPE, html/head/body tags, no obvious tag soup
 *   asset_integrity   — referenced CSS/JS files exist in the virtual FS
 *   js_runtime        — scripts execute without throwing in a sandboxed VM
 *   interactive_elems — discoverable CTAs, buttons, forms, or nav links present
 *   content_presence  — body contains substantial visible text / UI content
 */
import { Script, createContext } from 'node:vm';
import type { EvaluatorWorkerReport } from '../../src/types/evaluation.ts';
import { bundleVirtualFS } from '../../src/lib/bundle-virtual-fs.ts';
import { resolvePreviewEntryPath } from '../../src/lib/preview-entry.ts';
import { resolveVirtualAssetPath } from '../../src/lib/resolve-virtual-asset-path.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import {
  QA_CONTENT_SCORE3_MIN_HEADINGS,
  QA_CONTENT_SCORE3_MIN_PARAGRAPHS,
  QA_CONTENT_SCORE4_MIN_HEADINGS,
  QA_CONTENT_SCORE4_MIN_SECTIONS,
  QA_CONTENT_SCORE5_MIN_HEADINGS,
  QA_CONTENT_SCORE5_MIN_PARAGRAPHS,
  QA_CONTENT_SCORE5_MIN_SECTIONS,
  QA_CONTENT_WORDS_T2,
  QA_CONTENT_WORDS_T3,
  QA_CONTENT_WORDS_T4,
  QA_CONTENT_WORDS_T5,
  QA_INTERACTIVE_SCORE2_MIN_TOTAL,
  QA_INTERACTIVE_SCORE3_MIN_ANCHORS,
  QA_INTERACTIVE_SCORE3_MIN_BUTTONS,
  QA_INTERACTIVE_SCORE3_MIN_TOTAL,
  QA_INTERACTIVE_SCORE4_MIN_ANCHORS,
  QA_INTERACTIVE_SCORE4_MIN_BUTTONS,
  QA_INTERACTIVE_SCORE4_MIN_NAVS,
  QA_INTERACTIVE_SCORE4_MIN_TOTAL,
  QA_INTERACTIVE_SCORE5_MIN_BUTTONS,
  QA_INTERACTIVE_SCORE5_MIN_FORMS,
  QA_INTERACTIVE_SCORE5_MIN_TOTAL,
} from './browser-eval-scoring-config.ts';
import { countMatches, extractExternalRefs, extractScriptBodies, hasTag } from './html-analysis-helpers.ts';

/** VM `runInContext` timeout per inline script (avoid infinite loops). */
const INLINE_SCRIPT_VM_TIMEOUT_MS = 2000;
/** First N non-empty inline scripts are executed (cap work per page). */
const MAX_INLINE_SCRIPTS_TO_RUN = 5;
/** Truncate stored runtime error messages for scoring payloads. */
const RUNTIME_ERROR_MSG_MAX_LEN = 200;
/** Console errors merged into the report (beyond inline script errors). */
const MAX_CONSOLE_ERRORS_IN_REPORT = 3;

// ── Criterion checks ──────────────────────────────────────────────────────────

function checkPageStructure(html: string): { score: number; notes: string } {
  const issues: string[] = [];
  let score = 5;

  if (!/<!\s*DOCTYPE\s+html/i.test(html)) { issues.push('missing DOCTYPE'); score -= 1; }
  if (!hasTag(html, 'html')) { issues.push('no <html> tag'); score -= 1; }
  if (!hasTag(html, 'head')) { issues.push('no <head> tag'); score -= 0.5; }
  if (!hasTag(html, 'body')) { issues.push('no <body> tag'); score -= 1; }

  const openTags = countMatches(html, /<[a-z][a-z0-9]*[\s>]/gi);
  const closeTags = countMatches(html, /<\/[a-z][a-z0-9]*>/gi);
  const imbalance = Math.abs(openTags - closeTags);
  if (imbalance > openTags * 0.3) {
    issues.push(`tag imbalance: ${openTags} open vs ${closeTags} close`);
    score -= 1;
  }

  return {
    score: Math.max(1, Math.round(score)),
    notes: issues.length > 0 ? issues.join('; ') : 'HTML structure looks well-formed',
  };
}

function checkAssetIntegrity(
  html: string,
  files: Record<string, string>,
  htmlFilePath: string,
): { score: number; notes: string } {
  const refs = extractExternalRefs(html);
  if (refs.length === 0) {
    return { score: 5, notes: 'No external asset references (all inlined)' };
  }

  const missing: string[] = [];
  const fileKeys = new Set(Object.keys(files));

  for (const ref of refs) {
    const raw = ref.src.trim();
    if (/^(https?:)/i.test(raw) || raw.startsWith('//')) continue;
    const resolved = resolveVirtualAssetPath(ref.src, htmlFilePath);
    if (resolved === undefined) continue;
    if (!fileKeys.has(resolved)) {
      missing.push(ref.src);
    }
  }

  if (missing.length === 0) {
    return { score: 5, notes: `All ${refs.length} asset reference(s) resolved` };
  }
  const score = Math.max(1, 5 - missing.length * 2);
  return {
    score,
    notes: `Missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` (+ ${missing.length - 3} more)` : ''}`,
  };
}

/** Minimal DOM node stub so `querySelector(...).addEventListener` does not throw in the VM. */
function createDomElementStub(): Record<string, unknown> {
  const stub: Record<string, unknown> = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    setAttribute: () => {},
    getAttribute: () => null,
    hasAttribute: () => false,
    appendChild: (n: unknown) => n,
    removeChild: () => {},
    insertBefore: (n: unknown) => n,
    style: {},
    textContent: '',
    innerHTML: '',
    innerText: '',
    focus: () => {},
    blur: () => {},
    click: () => {},
    matches: () => false,
    closest: () => null,
    parentElement: null,
    parentNode: null,
    children: [],
    childNodes: [],
    nextElementSibling: null,
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }),
  };
  stub.querySelector = () => createDomElementStub();
  stub.querySelectorAll = () => createEmptyNodeList();
  stub.getElementById = () => createDomElementStub();
  return stub;
}

function createEmptyNodeList(): {
  length: number;
  forEach: () => void;
  item: () => null;
  [Symbol.iterator]: () => Iterator<never>;
} {
  return {
    length: 0,
    forEach() {},
    item: () => null,
    *[Symbol.iterator]() {},
  };
}

function createBrowserQaSandboxDocument() {
  const elStub = createDomElementStub();
  const bodyStub = createDomElementStub();
  const headStub = createDomElementStub();
  const noop = () => {};
  const documentMock = {
    addEventListener(type: string, fn: unknown) {
      if (type === 'DOMContentLoaded' && typeof fn === 'function') {
        try {
          (fn as (...args: unknown[]) => void)();
        } catch {
          /* surfaced via runInContext if sync init throws */
        }
      }
    },
    removeEventListener: noop,
    querySelector: () => elStub,
    querySelectorAll: () => createEmptyNodeList(),
    getElementById: () => elStub,
    createElement: () => createDomElementStub(),
    createTextNode: () => ({}),
    body: bodyStub,
    head: headStub,
    documentElement: elStub,
  };
  return documentMock;
}

function checkJsRuntime(html: string): { score: number; notes: string; errors: string[] } {
  const scripts = extractScriptBodies(html);
  if (scripts.length === 0) {
    return { score: 5, notes: 'No inline scripts to execute', errors: [] };
  }

  const consoleErrors: string[] = [];
  const runtimeErrors: string[] = [];

  const documentMock = createBrowserQaSandboxDocument();
  const fireMaybe = (fn: unknown) => {
    if (typeof fn === 'function') {
      try {
        (fn as (...args: unknown[]) => void)();
      } catch {
        /* runInContext will surface throws from inline scripts */
      }
    }
  };
  const sandbox = createContext({
    document: documentMock,
    /** Global/window listeners (global object === window after self-reference below). */
    addEventListener(type: string, fn: unknown) {
      if (type === 'load') fireMaybe(fn);
    },
    removeEventListener: () => {},
    navigator: { userAgent: 'node-browser-qa' },
    location: { href: 'about:blank', protocol: 'http:', hostname: 'localhost' },
    history: { pushState: () => {}, replaceState: () => {} },
    setTimeout: () => 0,
    setInterval: () => 0,
    clearTimeout: () => {},
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    fetch: () => Promise.reject(new Error('fetch not available in QA sandbox')),
    console: {
      log: () => {},
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: (...args: unknown[]) => {
        consoleErrors.push(args.map(String).join(' '));
      },
    },
    URL: typeof URL !== 'undefined' ? URL : undefined,
    parseInt,
    parseFloat,
    JSON,
    Math,
    Date,
    Array,
    Object,
    Promise,
    RegExp,
    Error,
    TypeError,
    undefined,
    NaN,
    Infinity,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
  });
  // window self-reference
  (sandbox as Record<string, unknown>).window = sandbox;
  (sandbox as Record<string, unknown>).self = sandbox;
  (sandbox as Record<string, unknown>).globalThis = sandbox;

  let scriptScore = 5;
  for (const src of scripts.slice(0, MAX_INLINE_SCRIPTS_TO_RUN)) {
    try {
      new Script(src).runInContext(sandbox, { timeout: INLINE_SCRIPT_VM_TIMEOUT_MS });
    } catch (err) {
      const msg = normalizeError(err);
      // Ignore missing browser APIs not worth penalising
      if (
        msg.includes('fetch not available') ||
        msg.includes('is not a constructor') ||
        msg.includes('CustomEvent') ||
        msg.includes('ResizeObserver') ||
        msg.includes('MutationObserver') ||
        msg.includes('IntersectionObserver') ||
        msg.includes('cancelAnimationFrame')
      ) {
        continue;
      }
      runtimeErrors.push(msg.slice(0, RUNTIME_ERROR_MSG_MAX_LEN));
      scriptScore -= 1.5;
    }
  }

  const allErrors = [...runtimeErrors, ...consoleErrors.slice(0, MAX_CONSOLE_ERRORS_IN_REPORT)];
  const score = Math.max(1, Math.round(scriptScore));

  if (allErrors.length === 0) {
    return { score: 5, notes: `${scripts.length} script(s) executed without errors`, errors: [] };
  }
  return {
    score,
    notes: `${runtimeErrors.length} runtime error(s), ${consoleErrors.length} console.error(s)`,
    errors: allErrors,
  };
}

function checkInteractiveElements(html: string): { score: number; notes: string } {
  const buttons = countMatches(html, /<button[\s>]/gi);
  const anchors = countMatches(html, /<a[\s>]/gi);
  const inputs = countMatches(html, /<input[\s>]/gi);
  const forms = countMatches(html, /<form[\s>]/gi);
  const onclicks = countMatches(html, /onclick=/gi);

  const total = buttons + anchors + inputs + forms + onclicks;
  const navs = countMatches(html, /<nav[\s>]/gi);

  let score = 1;
  if (total >= QA_INTERACTIVE_SCORE2_MIN_TOTAL) score = 2;
  if (
    total >= QA_INTERACTIVE_SCORE3_MIN_TOTAL ||
    (anchors >= QA_INTERACTIVE_SCORE3_MIN_ANCHORS && buttons >= QA_INTERACTIVE_SCORE3_MIN_BUTTONS)
  ) {
    score = 3;
  }
  if (
    total >= QA_INTERACTIVE_SCORE4_MIN_TOTAL ||
    (buttons >= QA_INTERACTIVE_SCORE4_MIN_BUTTONS &&
      (anchors >= QA_INTERACTIVE_SCORE4_MIN_ANCHORS || navs >= QA_INTERACTIVE_SCORE4_MIN_NAVS))
  ) {
    score = 4;
  }
  if (
    total >= QA_INTERACTIVE_SCORE5_MIN_TOTAL &&
    (buttons >= QA_INTERACTIVE_SCORE5_MIN_BUTTONS || forms >= QA_INTERACTIVE_SCORE5_MIN_FORMS)
  ) {
    score = 5;
  }

  const parts: string[] = [];
  if (buttons > 0) parts.push(`${buttons} button(s)`);
  if (anchors > 0) parts.push(`${anchors} link(s)`);
  if (inputs > 0) parts.push(`${inputs} input(s)`);
  if (forms > 0) parts.push(`${forms} form(s)`);
  if (navs > 0) parts.push(`${navs} nav region(s)`);

  return {
    score,
    notes: parts.length > 0 ? parts.join(', ') : 'No interactive elements found',
  };
}

function checkContentPresence(html: string): { score: number; notes: string } {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch?.[1] ?? html;

  const stripped = body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const wordCount = stripped ? stripped.split(/\s+/).filter((w) => w.length > 2).length : 0;
  const headings = countMatches(html, /<h[1-6][\s>]/gi);
  const paragraphs = countMatches(html, /<p[\s>]/gi);
  const sections = countMatches(html, /<(section|article|main|header|footer)[\s>]/gi);

  let score = 1;
  if (wordCount >= QA_CONTENT_WORDS_T2) score = 2;
  if (
    wordCount >= QA_CONTENT_WORDS_T3 ||
    (headings >= QA_CONTENT_SCORE3_MIN_HEADINGS && paragraphs >= QA_CONTENT_SCORE3_MIN_PARAGRAPHS)
  ) {
    score = 3;
  }
  if (
    wordCount >= QA_CONTENT_WORDS_T4 &&
    (headings >= QA_CONTENT_SCORE4_MIN_HEADINGS || sections >= QA_CONTENT_SCORE4_MIN_SECTIONS)
  ) {
    score = 4;
  }
  if (
    wordCount >= QA_CONTENT_WORDS_T5 &&
    headings >= QA_CONTENT_SCORE5_MIN_HEADINGS &&
    (paragraphs >= QA_CONTENT_SCORE5_MIN_PARAGRAPHS || sections >= QA_CONTENT_SCORE5_MIN_SECTIONS)
  ) {
    score = 5;
  }

  return {
    score,
    notes: `≈${wordCount} words, ${headings} heading(s), ${paragraphs} paragraph(s), ${sections} section(s)`,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface BrowserQAInput {
  files: Record<string, string>;
}

export function runBrowserQA(input: BrowserQAInput): EvaluatorWorkerReport {
  let bundledHtml: string;
  try {
    bundledHtml = bundleVirtualFS(input.files);
  } catch {
    bundledHtml = Object.values(input.files).find((v) => /<html/i.test(v)) ?? '';
  }

  const htmlPaths = Object.keys(input.files).filter((k) => k.endsWith('.html'));
  const entryKey = resolvePreviewEntryPath(input.files);
  const entryHtml = input.files[entryKey] ?? bundledHtml;

  const scores: EvaluatorWorkerReport['scores'] = {};
  const findings: EvaluatorWorkerReport['findings'] = [];
  const hardFails: EvaluatorWorkerReport['hardFails'] = [];

  const structure = checkPageStructure(entryHtml);
  scores.page_structure = structure;
  if (structure.score <= 2) {
    findings.push({ severity: 'high', summary: 'Malformed HTML structure', detail: structure.notes });
  }

  let assets = checkAssetIntegrity(bundledHtml, input.files, entryKey);
  for (const p of htmlPaths) {
    const a = checkAssetIntegrity(input.files[p]!, input.files, p);
    if (a.score < assets.score) assets = a;
  }
  scores.asset_integrity = assets;
  if (assets.score < 5) {
    findings.push({ severity: 'high', summary: 'Missing asset references', detail: assets.notes });
    // Hard-fail only when integrity is badly broken (score ≤2 ≈ 2+ missing refs).
    // A single missing script/CSS (score 3) should not trap the revision loop.
    if (assets.score <= 2) {
      hardFails.push({ code: 'missing_assets', message: assets.notes });
    }
  }

  const runtime = checkJsRuntime(bundledHtml);
  scores.js_runtime = { score: runtime.score, notes: runtime.notes };
  if (runtime.errors.length > 0) {
    for (const err of runtime.errors.slice(0, 3)) {
      findings.push({
        severity: runtime.score <= 2 ? 'high' : 'medium',
        summary: 'JS runtime error',
        detail: err,
      });
    }
    if (runtime.score <= 1) {
      hardFails.push({ code: 'js_execution_failure', message: runtime.errors[0] ?? 'script failed' });
    }
  }

  let interactive = checkInteractiveElements(bundledHtml);
  for (const p of htmlPaths) {
    const i = checkInteractiveElements(input.files[p]);
    if (i.score > interactive.score) interactive = i;
  }
  scores.interactive_elems = interactive;
  if (interactive.score <= 1) {
    findings.push({ severity: 'medium', summary: 'No interactive elements found', detail: interactive.notes });
  }

  let content = checkContentPresence(bundledHtml);
  for (const p of htmlPaths) {
    const c = checkContentPresence(input.files[p]);
    if (c.score > content.score) content = c;
  }
  scores.content_presence = content;
  if (content.score <= 1) {
    findings.push({ severity: 'high', summary: 'Page appears empty or minimal', detail: content.notes });
    hardFails.push({ code: 'empty_page', message: content.notes });
  }

  return { rubric: 'browser', scores, findings, hardFails };
}
