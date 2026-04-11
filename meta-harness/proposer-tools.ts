/**
 * OpenRouter tool definitions + dispatch for the meta-harness proposer.
 */
import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { EvaluatorRubricId } from '../src/types/evaluation.ts';
import { EVALUATOR_RUBRIC_IDS } from '../src/types/evaluation.ts';
import { resolveRubricWeights } from '../server/lib/evaluation-revision-gate.ts';
import type { MetaHarnessMode } from './modes.ts';
import type { OpenRouterFunctionTool } from './openrouter-client.ts';
import { normalizeError } from '../src/lib/error-utils.ts';
import { SEARCH_MAX_DEPTH, SEARCH_MAX_FILE_BYTES, SEARCH_MAX_HITS } from './constants.ts';
import { debugMetaHarness } from './debug-log.ts';
import { SimplifiedMetaHarnessTestCaseSchema } from './test-case-hydrator.ts';
import { snapshotBeforeWrite } from './version-store.ts';

export type ProposerContext = {
  root: string;
  metaHarnessDir: string;
  skillsDir: string;
  testCasesDir: string;
  evalRunsBaseDir: string;
  /** Partial override merged with defaults via resolveRubricWeights. */
  rubricWeightPatch: Partial<Record<EvaluatorRubricId, number>>;
  submitted: { reasoning: string } | null;
  mode: MetaHarnessMode;
  /**
   * True after write_skill, delete_skill, or write_system_prompt — disk state differs from session baseline
   * for the next eval.
   */
  skillsMutated: boolean;
};

const ToolReadFileArgsSchema = z.object({ path: z.string() });
const ToolListDirArgsSchema = z.object({ path: z.string() });
const ToolSearchArgsSchema = z.object({ pattern: z.string(), under: z.string() });
const ToolWriteSkillArgsSchema = z.object({ key: z.string(), content: z.string() });
const ToolDeleteSkillArgsSchema = z.object({ key: z.string() });
const ToolWriteSystemPromptArgsSchema = z.object({ body: z.string() });
const ToolAddTestCaseArgsSchema = z.object({ name: z.string(), json: z.string() });
const ToolSubmitCandidateArgsSchema = z.object({ reasoning: z.string() });
const ToolSetRubricWeightsArgsSchema = z
  .object({
    design: z.number().finite().nonnegative().optional(),
    strategy: z.number().finite().nonnegative().optional(),
    implementation: z.number().finite().nonnegative().optional(),
    browser: z.number().finite().nonnegative().optional(),
  })
  .passthrough();

/** Sanitize a single path segment (skill key, test-case basename) from tool JSON. */
export function sanitizeProposerKey(raw: string): string | null {
  const key = raw.trim().replace(/[^\w-]/g, '');
  return key.length > 0 ? key : null;
}

function allowedReadRoots(ctx: ProposerContext): string[] {
  return [ctx.metaHarnessDir, ctx.skillsDir, ctx.evalRunsBaseDir];
}

export function resolveSafeRead(ctx: ProposerContext, userPath: string): string | null {
  const trimmed = userPath.trim();
  const abs = path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(ctx.root, trimmed);
  for (const r of allowedReadRoots(ctx)) {
    const rr = path.resolve(r);
    if (abs === rr || abs.startsWith(rr + path.sep)) return abs;
  }
  return null;
}

async function toolReadFile(ctx: ProposerContext, args: { path: string }): Promise<string> {
  const abs = resolveSafeRead(ctx, args.path);
  if (!abs) return `Error: path not allowed or out of scope: ${args.path}`;
  try {
    return await readFile(abs, 'utf8');
  } catch (e) {
    return `Error reading file: ${normalizeError(e)}`;
  }
}

async function toolListDir(ctx: ProposerContext, args: { path: string }): Promise<string> {
  const abs = resolveSafeRead(ctx, args.path);
  if (!abs) return `Error: path not allowed: ${args.path}`;
  try {
    const st = await stat(abs);
    if (!st.isDirectory()) return `Not a directory: ${args.path}`;
    const entries = await readdir(abs, { withFileTypes: true });
    return entries.map((e) => `${e.isDirectory() ? 'd' : 'f'} ${String(e.name)}`).join('\n');
  } catch (e) {
    return `Error: ${normalizeError(e)}`;
  }
}

async function toolSearch(ctx: ProposerContext, args: { pattern: string; under: string }): Promise<string> {
  const abs = resolveSafeRead(ctx, args.under);
  if (!abs) return `Error: under path not allowed: ${args.under}`;
  const pattern = args.pattern.toLowerCase();
  const hits: string[] = [];
  const maxHits = SEARCH_MAX_HITS;
  const maxBytes = SEARCH_MAX_FILE_BYTES;
  async function walk(dir: string, depth: number): Promise<void> {
    if (hits.length >= maxHits || depth > SEARCH_MAX_DEPTH) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (hits.length >= maxHits) break;
      const p = path.join(dir, String(e.name));
      if (e.isDirectory()) await walk(p, depth + 1);
      else {
        try {
          const st = await stat(p);
          if (!st.isFile() || st.size > maxBytes) continue;
          const text = await readFile(p, 'utf8');
          if (text.toLowerCase().includes(pattern)) hits.push(p);
        } catch (e) {
          debugMetaHarness('search file read skipped:', normalizeError(e));
        }
      }
    }
  }
  const st = await stat(abs);
  if (st.isFile()) {
    const text = await readFile(abs, 'utf8');
    return text.toLowerCase().includes(pattern) ? `match: ${abs}` : 'no match';
  }
  await walk(abs, 0);
  return hits.length ? hits.join('\n') : 'no matches';
}

async function toolWriteSkill(ctx: ProposerContext, args: { key: string; content: string }): Promise<string> {
  const key = sanitizeProposerKey(args.key);
  if (!key) return 'Error: invalid skill key';
  const dir = path.join(ctx.skillsDir, key);
  await mkdir(dir, { recursive: true });
  const skillPath = path.join(dir, 'SKILL.md');
  const relSkill = path.posix.join('skills', key, 'SKILL.md');
  const snap = await snapshotBeforeWrite({
    repoRoot: ctx.root,
    relPath: relSkill,
    source: 'meta-harness:proposer:write_skill',
  });
  if (!snap.ok) return `Error: version snapshot failed: ${snap.error}`;
  await writeFile(skillPath, args.content, 'utf8');
  ctx.skillsMutated = true;
  return `Wrote ${path.relative(ctx.root, skillPath)}`;
}

async function toolDeleteSkill(ctx: ProposerContext, args: { key: string }): Promise<string> {
  const key = sanitizeProposerKey(args.key);
  if (!key) return 'Error: invalid skill key';
  const dir = path.join(ctx.skillsDir, key);
  const relSkill = path.posix.join('skills', key, 'SKILL.md');
  const snapDel = await snapshotBeforeWrite({
    repoRoot: ctx.root,
    relPath: relSkill,
    source: 'meta-harness:proposer:delete_skill',
    action: 'delete',
  });
  if (!snapDel.ok) return `Error: version snapshot failed: ${snapDel.error}`;
  try {
    await rm(dir, { recursive: true, force: true });
    ctx.skillsMutated = true;
    return `Removed skills/${key}`;
  } catch (e) {
    return `Error: ${normalizeError(e)}`;
  }
}

/** Split PROMPT.md into YAML frontmatter block (including closing ---) and body. */
function splitDesignerSystemPromptFile(raw: string): { preamble: string; body: string } | null {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const preamble = lines.slice(0, end + 1).join('\n');
  const body = lines.slice(end + 1).join('\n').replace(/^\n+/, '');
  return { preamble, body };
}

async function toolWriteSystemPrompt(ctx: ProposerContext, args: { body: string }): Promise<string> {
  if (!args.body.trim()) return 'Error: empty body';
  const absFile = path.resolve(ctx.root, 'prompts', 'designer-agentic-system', 'PROMPT.md');
  let raw: string;
  try {
    raw = await readFile(absFile, 'utf8');
  } catch (e) {
    return `Error: ${normalizeError(e)}`;
  }
  const split = splitDesignerSystemPromptFile(raw);
  if (!split) {
    return 'Error: PROMPT.md must start with YAML frontmatter (--- … ---)';
  }
  const newBody = args.body.replace(/\r\n/g, '\n').trimEnd();
  const out = `${split.preamble}\n\n${newBody}\n`;
  const snapP = await snapshotBeforeWrite({
    repoRoot: ctx.root,
    relPath: 'prompts/designer-agentic-system/PROMPT.md',
    source: 'meta-harness:proposer:write_system_prompt',
  });
  if (!snapP.ok) return `Error: version snapshot failed: ${snapP.error}`;
  await writeFile(absFile, out, 'utf8');
  ctx.skillsMutated = true;
  return `Wrote body of ${path.relative(ctx.root, absFile)} (${newBody.length} chars); frontmatter preserved`;
}

async function toolAddTestCase(ctx: ProposerContext, args: { name: string; json: string }): Promise<string> {
  const name = sanitizeProposerKey(args.name);
  if (!name) return 'Error: invalid test case name';
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.json) as unknown;
  } catch {
    return 'Error: json parse failed';
  }
  const merged =
    typeof parsed === 'object' && parsed !== null
      ? { ...(parsed as Record<string, unknown>), name }
      : { name };
  const checked = SimplifiedMetaHarnessTestCaseSchema.safeParse(merged);
  if (!checked.success) {
    return `Error: invalid test case shape: ${checked.error.message}`;
  }
  const dest = path.join(ctx.testCasesDir, `${name}.json`);
  await mkdir(ctx.testCasesDir, { recursive: true });
  await writeFile(dest, `${JSON.stringify(checked.data, null, 2)}\n`, 'utf8');
  return `Wrote ${path.relative(ctx.root, dest)}`;
}

function toolSubmitCandidate(ctx: ProposerContext, args: { reasoning: string }): string {
  ctx.submitted = { reasoning: args.reasoning.trim() || '(no reasoning)' };
  return 'Candidate submitted. Stop proposing further edits in this turn.';
}

function toolSetRubricWeights(
  ctx: ProposerContext,
  args: z.infer<typeof ToolSetRubricWeightsArgsSchema>,
): string {
  const patch: Partial<Record<EvaluatorRubricId, number>> = {};
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const v = args[rid];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      patch[rid] = v;
    }
  }
  if (Object.keys(patch).length === 0) {
    return 'Error: provide at least one non-negative number among design, strategy, implementation, browser';
  }
  Object.assign(ctx.rubricWeightPatch, patch);
  const resolved = resolveRubricWeights(ctx.rubricWeightPatch);
  return (
    `Stored rubric weight patch. Effective blend after merge + normalize: ` +
    `design=${resolved.design.toFixed(3)} strategy=${resolved.strategy.toFixed(3)} ` +
    `implementation=${resolved.implementation.toFixed(3)} browser=${resolved.browser.toFixed(3)}`
  );
}

export const TOOLS_OPENROUTER: OpenRouterFunctionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a text file under meta-harness/ (history including session-*/PROMOTION_REPORT.md at session root, test-cases), skills/, or eval-runs base. Prompt / skill bodies for edit surfaces are usually pre-loaded in the user message.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path relative to repo root' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description:
        'List directory entries under meta-harness/, skills/, or eval-runs base. Each history/session-* folder may contain PROMOTION_REPORT.md at the session root (alongside session.json). History and skills are largely pre-loaded.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'Recursive substring search (case-insensitive) under an allowed directory',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          under: { type: 'string', description: 'Path relative to repo root' },
        },
        required: ['pattern', 'under'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_skill',
      description: 'Write or replace skills/<key>/SKILL.md (full file content)',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['key', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_skill',
      description: 'Delete skills/<key>/ recursively',
      parameters: {
        type: 'object',
        properties: { key: { type: 'string' } },
        required: ['key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_system_prompt',
      description:
        'Replace the **markdown body** of prompts/designer-agentic-system/PROMPT.md (Pi designer system prompt). YAML frontmatter is preserved; pass only the body text after the second ---.',
      parameters: {
        type: 'object',
        properties: {
          body: {
            type: 'string',
            description: 'Full markdown body for PROMPT.md (not including frontmatter)',
          },
        },
        required: ['body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_rubric_weights',
      description:
        'Adjust how much each evaluator rubric contributes to the agentic overall score (design, strategy, implementation, browser). Pass non-negative numbers for any subset; server merges with defaults and renormalizes to sum 1.',
      parameters: {
        type: 'object',
        properties: {
          design: { type: 'number', description: 'Relative weight (>= 0)' },
          strategy: { type: 'number', description: 'Relative weight (>= 0)' },
          implementation: { type: 'number', description: 'Relative weight (>= 0)' },
          browser: { type: 'number', description: 'Relative weight (>= 0)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_test_case',
      description: 'Add a simplified meta-harness JSON test case under meta-harness/test-cases/<name>.json',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          json: { type: 'string', description: 'Stringified JSON matching the simplified test schema' },
        },
        required: ['name', 'json'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_candidate',
      description: 'Finish this proposal turn with reasoning tying changes to expected evaluation gains',
      parameters: {
        type: 'object',
        properties: { reasoning: { type: 'string' } },
        required: ['reasoning'],
      },
    },
  },
];

export async function dispatchTool(
  ctx: ProposerContext,
  name: string,
  rawArgs: string,
): Promise<string> {
  if (
    (ctx.mode === 'incubate' || ctx.mode === 'inputs') &&
    name === 'set_rubric_weights'
  ) {
    return 'Error: rubric weight tuning is only used in design/e2e agentic evaluation modes.';
  }
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || '{}') as Record<string, unknown>;
  } catch {
    return 'Error: invalid JSON arguments for tool';
  }
  switch (name) {
    case 'read_file': {
      const p = ToolReadFileArgsSchema.safeParse(args);
      if (!p.success) return `Error: invalid arguments for read_file: ${p.error.message}`;
      return toolReadFile(ctx, p.data);
    }
    case 'list_dir': {
      const p = ToolListDirArgsSchema.safeParse(args);
      if (!p.success) return `Error: invalid arguments for list_dir: ${p.error.message}`;
      return toolListDir(ctx, p.data);
    }
    case 'search': {
      const p = ToolSearchArgsSchema.safeParse(args);
      if (!p.success) return `Error: invalid arguments for search: ${p.error.message}`;
      return toolSearch(ctx, p.data);
    }
    case 'write_skill': {
      const p = ToolWriteSkillArgsSchema.safeParse(args);
      if (!p.success) return `Error: invalid arguments for write_skill: ${p.error.message}`;
      return toolWriteSkill(ctx, p.data);
    }
    case 'delete_skill': {
      const p = ToolDeleteSkillArgsSchema.safeParse(args);
      if (!p.success) return `Error: invalid arguments for delete_skill: ${p.error.message}`;
      return toolDeleteSkill(ctx, p.data);
    }
    case 'set_rubric_weights': {
      const p = ToolSetRubricWeightsArgsSchema.safeParse(args);
      if (!p.success) return `Error: invalid arguments for set_rubric_weights: ${p.error.message}`;
      return toolSetRubricWeights(ctx, p.data);
    }
    case 'write_system_prompt': {
      const p = ToolWriteSystemPromptArgsSchema.safeParse(args);
      if (!p.success) return `Error: invalid arguments for write_system_prompt: ${p.error.message}`;
      return toolWriteSystemPrompt(ctx, p.data);
    }
    case 'add_test_case': {
      const p = ToolAddTestCaseArgsSchema.safeParse(args);
      if (!p.success) return `Error: invalid arguments for add_test_case: ${p.error.message}`;
      return toolAddTestCase(ctx, p.data);
    }
    case 'submit_candidate': {
      const p = ToolSubmitCandidateArgsSchema.safeParse(args);
      if (!p.success) return `Error: invalid arguments for submit_candidate: ${p.error.message}`;
      return toolSubmitCandidate(ctx, p.data);
    }
    default:
      return `Unknown tool: ${name}`;
  }
}
