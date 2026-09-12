import { handle } from "@hono/node-server/vercel";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Bash } from "just-bash";
import { minimatch } from "minimatch";
import { DEFAULT_MAX_LINES, DEFAULT_MAX_BYTES, createReadToolDefinition, createWriteToolDefinition, createEditToolDefinition, createLsToolDefinition, createFindToolDefinition, createGrepToolDefinition, truncateLine, truncateHead, formatSize, AuthStorage, createAgentSession, SessionManager, DefaultResourceLoader } from "@mariozechner/pi-coding-agent";
import "@mariozechner/pi-ai";
import { Type } from "typebox";
import { Script, createContext } from "node:vm";
import { fileURLToPath } from "node:url";
import path, { dirname, resolve } from "node:path";
import fs, { readFileSync, existsSync } from "node:fs";
import { jsonrepair } from "jsonrepair";
import { config } from "dotenv";
import { streamSSE } from "hono/streaming";
import fs$1, { readFile, mkdir, writeFile } from "node:fs/promises";
import { parse } from "yaml";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
import { Buffer as Buffer$1 } from "node:buffer";
function generateId() {
  return crypto.randomUUID();
}
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function interpolate(template, vars) {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (match, key) => key in vars ? vars[key] : match
  );
}
const SOURCE_SECTION_IDS = [
  "design-brief",
  "research-context",
  "objectives-metrics",
  "design-constraints"
];
const SECTION_TAG = {
  "design-brief": "design_brief",
  "research-context": "research_context",
  "objectives-metrics": "objectives_metrics",
  "design-constraints": "design_constraints"
};
function appendBlock$1(lines, tag, body) {
  const trimmed = body?.trim();
  if (!trimmed) return;
  lines.push(`<${tag}>
${trimmed}
</${tag}>`);
}
function buildInternalContext(spec) {
  const lines = [];
  if (spec.title?.trim()) {
    lines.push(`<canvas_title>${spec.title.trim()}</canvas_title>`);
  }
  for (const sectionId of SOURCE_SECTION_IDS) {
    appendBlock$1(lines, SECTION_TAG[sectionId], spec.sections[sectionId]?.content);
  }
  return lines.join("\n\n");
}
function formatReferenceDesignsBlock(referenceDesigns) {
  if (!referenceDesigns || referenceDesigns.length === 0) return "";
  let block = "\n\n## Reference Designs (from previous iterations)\n";
  block += "The following designs were generated in a previous iteration. Analyze their strengths and weaknesses, then propose new hypothesis strategies that improve upon them.\n\n";
  for (const ref of referenceDesigns) {
    block += `### ${ref.name}
\`\`\`
${ref.code}
\`\`\`

`;
  }
  return block;
}
function formatExistingHypothesesBlock(existingStrategies) {
  const existing = existingStrategies;
  if (!existing || existing.length === 0) return "";
  let block = "\n\n## Existing Hypotheses (already explored)\n";
  block += "The following strategies already exist. Do NOT reproduce them. Generate new strategies that explore genuinely different regions of the solution space — not different for novelty, but pushing toward ideas that could outperform these. Every new strategy must still be grounded in the specification's stated needs and research.\n\n";
  for (let i = 0; i < existing.length; i++) {
    const s = existing[i];
    block += `${i + 1}. **${s.name}**
`;
    if (s.hypothesis) block += `   - Hypothesis: ${s.hypothesis}
`;
    if (s.rationale) block += `   - Rationale: ${s.rationale}
`;
    if (s.measurements) block += `   - Measurements: ${s.measurements}
`;
    const dims = Object.entries(s.dimensionValues);
    if (dims.length > 0) {
      block += `   - Hypothesis positions: ${dims.map(([k, v]) => `${k}: ${v}`).join(", ")}
`;
    }
    block += "\n";
  }
  return block;
}
function formatIncubatorHypothesisCountLine(count) {
  if (count == null) return "";
  return `
Produce exactly ${count} new hypothesis strategies.
`;
}
function buildIncubatorUserPrompt(spec, incubatorUserTemplate, referenceDesigns, options) {
  return interpolate(incubatorUserTemplate, {
    INTERNAL_CONTEXT: buildInternalContext(spec),
    REFERENCE_DESIGNS_BLOCK: formatReferenceDesignsBlock(referenceDesigns),
    EXISTING_HYPOTHESES_BLOCK: formatExistingHypothesesBlock(options?.existingStrategies),
    INCUBATOR_HYPOTHESIS_COUNT_LINE: formatIncubatorHypothesisCountLine(options?.count)
  });
}
const SANDBOX_PROJECT_ROOT = "/home/user/project";
function sandboxProjectAbsPath(rel) {
  const trimmed = rel.replace(/^\/+/, "");
  return `${SANDBOX_PROJECT_ROOT}/${trimmed}`;
}
function buildSandboxSeedMaps(options) {
  const files = {};
  if (options.seedFiles) {
    for (const [p, content] of Object.entries(options.seedFiles)) {
      files[sandboxProjectAbsPath(p)] = content;
    }
  }
  return files;
}
function createAgentBashSandbox(options = {}) {
  const files = buildSandboxSeedMaps(options);
  return new Bash({
    files,
    cwd: SANDBOX_PROJECT_ROOT,
    executionLimits: {
      maxCommandCount: 5e3,
      maxLoopIterations: 5e3,
      maxSedIterations: 5e3,
      maxAwkIterations: 5e3
    }
  });
}
const SANDBOX_INTERNAL_SUBDIRS = [".skills"];
function isInternalWorkspacePath(absPath) {
  for (const sub of SANDBOX_INTERNAL_SUBDIRS) {
    const prefix = `${SANDBOX_PROJECT_ROOT}/${sub}/`;
    if (absPath === `${SANDBOX_PROJECT_ROOT}/${sub}` || absPath.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}
async function extractDesignFiles(bash) {
  const paths = bash.fs.getAllPaths().filter((p) => {
    if (!p.startsWith(`${SANDBOX_PROJECT_ROOT}/`) && p !== SANDBOX_PROJECT_ROOT) return false;
    if (p === SANDBOX_PROJECT_ROOT) return false;
    if (isInternalWorkspacePath(p)) return false;
    return true;
  });
  const out = {};
  for (const abs of paths.sort()) {
    let stat;
    try {
      stat = await bash.fs.stat(abs);
    } catch {
      continue;
    }
    if (!stat.isFile) continue;
    let body;
    try {
      body = await bash.fs.readFile(abs, "utf8");
    } catch {
      continue;
    }
    const rel = abs.startsWith(`${SANDBOX_PROJECT_ROOT}/`) ? abs.slice(SANDBOX_PROJECT_ROOT.length + 1) : abs;
    out[rel] = body;
  }
  return out;
}
function computeDesignFilesBeyondSeed(extracted, seedFiles) {
  if (!seedFiles || Object.keys(seedFiles).length === 0) {
    return { ...extracted };
  }
  const out = {};
  for (const [p, content] of Object.entries(extracted)) {
    const seedContent = seedFiles[p];
    if (seedContent === void 0 || seedContent !== content) {
      out[p] = content;
    }
  }
  return out;
}
async function snapshotDesignFiles(bash) {
  const files = await extractDesignFiles(bash);
  return new Map(Object.entries(files));
}
const SANDBOX_LIMITS = {
  /** Max chars per grep line in virtual grep output. */
  grepMaxLineLength: 500,
  /** Pi virtual `ls` tool entry cap. */
  lsMaxEntries: 500,
  /** Pi virtual `find` tool result cap. */
  findMaxResults: 1e3,
  /** Default max grep matches when the tool `limit` param is omitted. */
  grepDefaultMatchLimit: 100,
  /** Max chars returned from bundled bash output to the model. */
  bashToolMaxChars: 51200
};
const SANDBOX_READ_MAX_LINES = DEFAULT_MAX_LINES;
const LOG_PREVIEW_SNIPPET_MAX$1 = 120;
const LOG_PREVIEW_SNIPPET_HEAD_CHARS$1 = LOG_PREVIEW_SNIPPET_MAX$1 - 3;
function normalizeLf(s) {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function strategy1LeadingWhitespaceOnly(fileContent, oldText) {
  const fileLines = fileContent.split("\n");
  const needleLines = oldText.split("\n");
  if (needleLines.length === 0) return null;
  const normalizedNeedle = needleLines.map((l) => l.replace(/^\s+/, ""));
  const matches = [];
  for (let i = 0; i <= fileLines.length - needleLines.length; i++) {
    let ok = true;
    for (let j = 0; j < needleLines.length; j++) {
      if (fileLines[i + j].replace(/^\s+/, "") !== normalizedNeedle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) matches.push(i);
  }
  if (matches.length !== 1) return null;
  const start = matches[0];
  return fileLines.slice(start, start + needleLines.length).join("\n");
}
function collapseWhitespace(s) {
  return s.replace(/\s+/g, " ").trim();
}
function strategy2CollapsedWhitespace(fileContent, oldText) {
  const target = collapseWhitespace(oldText);
  if (target === "") return null;
  const lines = fileContent.split("\n");
  const needleLineCount = oldText.split("\n").length;
  const minLen = Math.max(1, needleLineCount - 3);
  const maxLen = Math.min(lines.length, needleLineCount + 3);
  const matches = [];
  for (let s = 0; s < lines.length; s++) {
    for (let len = minLen; len <= maxLen && s + len <= lines.length; len++) {
      const chunk = lines.slice(s, s + len).join("\n");
      if (collapseWhitespace(chunk) === target) {
        matches.push(chunk);
      }
    }
  }
  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] : null;
}
function strategy3LineTrimAnchors(fileContent, oldText) {
  const fileLines = fileContent.split("\n");
  const needleLines = oldText.split("\n");
  if (needleLines.length === 0) return null;
  const L = needleLines.length;
  const blocks = [];
  for (let i = 0; i <= fileLines.length - L; i++) {
    let ok = true;
    for (let k = 0; k < L; k++) {
      if (fileLines[i + k].trim() !== needleLines[k].trim()) {
        ok = false;
        break;
      }
    }
    if (ok) {
      blocks.push(fileLines.slice(i, i + L).join("\n"));
    }
  }
  if (blocks.length !== 1) return null;
  return blocks[0];
}
function collapseAndLowercase(s) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}
function strategy4CaseInsensitiveCollapsed(fileContent, oldText) {
  const fileLines = fileContent.split("\n");
  const needleLines = oldText.split("\n");
  if (needleLines.length === 0) return null;
  const L = needleLines.length;
  const normalizedNeedle = needleLines.map(collapseAndLowercase);
  const blocks = [];
  for (let i = 0; i <= fileLines.length - L; i++) {
    let ok = true;
    for (let k = 0; k < L; k++) {
      if (collapseAndLowercase(fileLines[i + k]) !== normalizedNeedle[k]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      blocks.push(fileLines.slice(i, i + L).join("\n"));
    }
  }
  if (blocks.length !== 1) return null;
  return blocks[0];
}
function strategy5AnchorLines(fileContent, oldText) {
  const fileLines = fileContent.split("\n");
  const needleLines = oldText.split("\n");
  if (needleLines.length < 3) return null;
  const firstNeedle = collapseAndLowercase(needleLines[0]);
  const lastNeedle = collapseAndLowercase(needleLines[needleLines.length - 1]);
  if (!firstNeedle || !lastNeedle) return null;
  const L = needleLines.length;
  const tolerance = 5;
  const blocks = [];
  for (let i = 0; i < fileLines.length; i++) {
    if (collapseAndLowercase(fileLines[i]) !== firstNeedle) continue;
    const minEnd = i + Math.max(L - tolerance, 2);
    const maxEnd = i + L + tolerance;
    for (let j = Math.min(minEnd, fileLines.length - 1); j < Math.min(maxEnd, fileLines.length); j++) {
      if (collapseAndLowercase(fileLines[j]) !== lastNeedle) continue;
      const span = j - i + 1;
      if (span >= L - tolerance && span <= L + tolerance) {
        blocks.push(fileLines.slice(i, j + 1).join("\n"));
      }
    }
  }
  if (blocks.length !== 1) return null;
  return blocks[0];
}
const STRATEGY_NAMES = [
  "strategy1LeadingWhitespaceOnly",
  "strategy2CollapsedWhitespace",
  "strategy3LineTrimAnchors",
  "strategy4CaseInsensitiveCollapsed",
  "strategy5AnchorLines"
];
const STRATEGIES = [
  strategy1LeadingWhitespaceOnly,
  strategy2CollapsedWhitespace,
  strategy3LineTrimAnchors,
  strategy4CaseInsensitiveCollapsed,
  strategy5AnchorLines
];
function attemptMatchCascade(fileContent, edits, diagnostics) {
  const file = normalizeLf(fileContent);
  const corrected = [];
  for (let ei = 0; ei < edits.length; ei++) {
    const e = edits[ei];
    const oldNorm = normalizeLf(e.oldText);
    const diag = {
      editIndex: ei,
      oldTextPreview: oldNorm.length > LOG_PREVIEW_SNIPPET_MAX$1 ? `${oldNorm.slice(0, LOG_PREVIEW_SNIPPET_HEAD_CHARS$1)}…` : oldNorm,
      resolvedBy: null,
      strategiesAttempted: []
    };
    let fixed = null;
    for (let si = 0; si < STRATEGIES.length; si++) {
      diag.strategiesAttempted.push(STRATEGY_NAMES[si]);
      fixed = STRATEGIES[si](file, oldNorm);
      if (fixed && fixed !== e.oldText) {
        diag.resolvedBy = STRATEGY_NAMES[si];
        break;
      }
      fixed = null;
    }
    diagnostics?.push(diag);
    if (!fixed) {
      return null;
    }
    corrected.push({ oldText: fixed, newText: e.newText });
  }
  return corrected;
}
function normalizeEditToolParams(params) {
  if (!params || typeof params !== "object") return null;
  const p = params;
  const pathVal = typeof p.path === "string" ? p.path : "";
  const edits = Array.isArray(p.edits) ? [...p.edits] : [];
  if (typeof p.oldText === "string" && typeof p.newText === "string") {
    edits.push({ oldText: p.oldText, newText: p.newText });
  }
  if (edits.length === 0) return null;
  for (const e of edits) {
    if (typeof e.oldText !== "string" || typeof e.newText !== "string") return null;
  }
  return { path: pathVal, edits };
}
function isEditNotFoundError(message) {
  return /could not find/i.test(message);
}
const KB = DEFAULT_MAX_BYTES / 1024;
const SANDBOX_TOOL_OVERRIDES = {
  read: {
    description: `Read UTF-8 text from a file in the in-memory project at ${SANDBOX_PROJECT_ROOT}. This workspace is text-only for tool purposes (no image attachments). Output is truncated to ${SANDBOX_READ_MAX_LINES} lines or ${KB}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.`
  },
  write: {
    description: `Create or overwrite a UTF-8 text file under ${SANDBOX_PROJECT_ROOT}. Parent directories are created as needed. Use for **new files** or **complete file rewrites**; prefer **edit** for partial changes to existing files.`
  },
  edit: {
    description: `Apply exact search-and-replace edits to an existing file under ${SANDBOX_PROJECT_ROOT}. Each \`oldText\` must appear **exactly once** in the **original** file before edits are applied. CRITICAL: Include **at least 3 lines of surrounding context** in each \`oldText\` so it uniquely identifies one occurrence — e.g. the full CSS rule block (selector + braces), not a single property line when that value repeats. Prefer **edit** over bash/sed for file changes.`
  },
  ls: {
    description: `List directory contents in the virtual project at ${SANDBOX_PROJECT_ROOT}. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles. Output is truncated to ${SANDBOX_LIMITS.lsMaxEntries} entries or ${KB}KB (whichever is hit first).`
  },
  find: {
    description: `Search for files by glob pattern under the in-memory project at ${SANDBOX_PROJECT_ROOT}. Returns matching file paths relative to the search directory. There is no .gitignore in this sandbox — every generated file is visible. Output is truncated to ${SANDBOX_LIMITS.findMaxResults} results or ${KB}KB (whichever is hit first).`
  },
  grep: {
    description: `Search file contents in the virtual project workspace using ripgrep-style search (just-bash \`rg\`). Returns matching lines with file paths and line numbers. Only the in-memory design files under ${SANDBOX_PROJECT_ROOT} exist — there is no .gitignore or host filesystem. Output is truncated to ${SANDBOX_LIMITS.grepDefaultMatchLimit} matches or ${KB}KB (whichever is hit first). Long lines are truncated to ${SANDBOX_LIMITS.grepMaxLineLength} chars.`
  }
};
function toProjectRelative(absPath) {
  if (!absPath.startsWith(`${SANDBOX_PROJECT_ROOT}/`)) return null;
  return absPath.slice(SANDBOX_PROJECT_ROOT.length + 1);
}
async function emitDesignFileIfNeeded(absPath, bash, onDesignFile) {
  const rel = toProjectRelative(absPath);
  if (!rel) return;
  try {
    const st = await bash.fs.stat(absPath);
    if (!st.isFile) return;
    const content = await bash.fs.readFile(absPath, "utf8");
    onDesignFile(rel, content);
  } catch {
  }
}
function resolveVirtualPath(relativeOrAbsolute, cwd) {
  const raw = (relativeOrAbsolute ?? ".").trim() || ".";
  const resolved = path.posix.isAbsolute(raw) ? path.posix.normalize(raw) : path.posix.resolve(cwd, raw);
  if (resolved !== SANDBOX_PROJECT_ROOT && !resolved.startsWith(`${SANDBOX_PROJECT_ROOT}/`)) {
    throw new Error(
      `Path escapes the sandbox workspace root: ${relativeOrAbsolute ?? ""} (resolved to ${resolved}; the workspace root is ${SANDBOX_PROJECT_ROOT}). Use paths relative to the workspace root.`
    );
  }
  return resolved;
}
function shellSingleQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
function createVirtualGrepTool(bash, sessionCwd) {
  const base = createGrepToolDefinition(sessionCwd);
  return {
    ...base,
    ...SANDBOX_TOOL_OVERRIDES.grep,
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { pattern, path: pathArg, glob: globPat, ignoreCase, literal, context, limit } = params;
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }
      const searchPath = resolveVirtualPath(pathArg, sessionCwd);
      try {
        await bash.fs.stat(searchPath);
      } catch {
        return {
          content: [{ type: "text", text: `Path not found: ${searchPath}` }],
          details: void 0
        };
      }
      const effectiveLimit = Math.max(1, limit ?? SANDBOX_LIMITS.grepDefaultMatchLimit);
      const contextLines = context && context > 0 ? context : 0;
      const argv = ["rg", "-nH"];
      if (ignoreCase) argv.push("--ignore-case");
      if (literal) argv.push("--fixed-strings");
      if (contextLines > 0) argv.push("-C", String(contextLines));
      const g = globPat?.trim();
      if (g) {
        argv.push("--glob", shellSingleQuote(g));
      }
      argv.push(shellSingleQuote(pattern), shellSingleQuote(searchPath));
      const cmd = argv.join(" ");
      const result = await bash.exec(cmd, { signal: signal ?? void 0 });
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }
      if (result.exitCode !== 0 && result.exitCode !== 1) {
        const errText = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
        return {
          content: [
            { type: "text", text: errText || `rg failed with exit code ${result.exitCode}` }
          ],
          details: void 0
        };
      }
      const rawOut = (result.stdout ?? "").replace(/\r\n/g, "\n").trimEnd();
      const stderrTrim = (result.stderr ?? "").trim();
      if (result.exitCode === 1 && !rawOut && stderrTrim) {
        return {
          content: [{ type: "text", text: stderrTrim }],
          details: void 0
        };
      }
      if (!rawOut) {
        return {
          content: [{ type: "text", text: "No matches found" }],
          details: void 0
        };
      }
      const lines = rawOut.split("\n");
      const matchLineRe = /^(.+):(\d+):/;
      let matchCount = 0;
      let matchLimitReached = false;
      let linesTruncated = false;
      const kept = [];
      for (const line of lines) {
        if (matchLineRe.test(line)) {
          if (matchCount >= effectiveLimit) {
            matchLimitReached = true;
            break;
          }
          matchCount++;
        }
        const { text: truncated, wasTruncated } = truncateLine(line, SANDBOX_LIMITS.grepMaxLineLength);
        if (wasTruncated) linesTruncated = true;
        kept.push(truncated);
      }
      let output = kept.join("\n");
      const truncation = truncateHead(output, { maxLines: Number.MAX_SAFE_INTEGER });
      output = truncation.content;
      const details = {};
      const notices = [];
      if (matchLimitReached) {
        notices.push(
          `${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`
        );
        details.matchLimitReached = effectiveLimit;
      }
      if (truncation.truncated) {
        notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
        details.truncation = truncation;
      }
      if (linesTruncated) {
        notices.push(
          `Some lines truncated to ${SANDBOX_LIMITS.grepMaxLineLength} chars. Use read tool to see full lines`
        );
        details.linesTruncated = true;
      }
      if (notices.length > 0) {
        output += `

[${notices.join(". ")}]`;
      }
      return {
        content: [{ type: "text", text: output }],
        details: Object.keys(details).length > 0 ? details : void 0
      };
    }
  };
}
function resolveSandboxPathForSession(relativeOrAbsolute, cwd) {
  return resolveVirtualPath(relativeOrAbsolute, cwd);
}
function createSandboxToolContext(bash, onDesignFile) {
  return {
    bash,
    sessionCwd: SANDBOX_PROJECT_ROOT,
    pathsSeenBeforeEdit: /* @__PURE__ */ new Set(),
    onDesignFile
  };
}
function buildSandboxedReadTool(ctx) {
  const { bash, sessionCwd, pathsSeenBeforeEdit } = ctx;
  const readInner = createReadToolDefinition(sessionCwd, {
    autoResizeImages: false,
    operations: {
      readFile: async (absolutePath) => {
        const text = await bash.fs.readFile(absolutePath, "utf8");
        return Buffer.from(text, "utf8");
      },
      access: async (absolutePath) => {
        const ok = await bash.fs.exists(absolutePath);
        if (!ok) throw new Error("ENOENT");
      }
    }
  });
  const read = {
    ...readInner,
    ...SANDBOX_TOOL_OVERRIDES.read,
    execute: async (toolCallId, params, signal, onUpdate, extCtx) => {
      const result = await readInner.execute(toolCallId, params, signal, onUpdate, extCtx);
      const rawPath = params != null && typeof params === "object" && "path" in params && typeof params.path === "string" ? params.path : "";
      if (rawPath) {
        pathsSeenBeforeEdit.add(resolveSandboxPathForSession(rawPath, sessionCwd));
      }
      return result;
    }
  };
  return read;
}
function assertInsideSandbox(absPath) {
  const normalized = path.posix.normalize(absPath);
  if (normalized !== SANDBOX_PROJECT_ROOT && !normalized.startsWith(`${SANDBOX_PROJECT_ROOT}/`)) {
    throw new Error(
      `Path escapes the sandbox workspace root: ${absPath} (the workspace root is ${SANDBOX_PROJECT_ROOT}). Use paths relative to the workspace root.`
    );
  }
  return normalized;
}
function buildSandboxedWriteTool(ctx) {
  const { bash, sessionCwd, pathsSeenBeforeEdit, onDesignFile } = ctx;
  const writeInner = createWriteToolDefinition(sessionCwd, {
    operations: {
      mkdir: async (dir) => {
        await bash.fs.mkdir(assertInsideSandbox(dir), { recursive: true });
      },
      writeFile: async (absolutePath, content) => {
        const contained = assertInsideSandbox(absolutePath);
        await bash.fs.mkdir(path.posix.dirname(contained), { recursive: true });
        await bash.fs.writeFile(contained, content, "utf8");
        await emitDesignFileIfNeeded(contained, bash, onDesignFile);
      }
    }
  });
  const write = {
    ...writeInner,
    ...SANDBOX_TOOL_OVERRIDES.write,
    execute: async (toolCallId, params, signal, onUpdate, extCtx) => {
      const result = await writeInner.execute(toolCallId, params, signal, onUpdate, extCtx);
      const rawPath = params != null && typeof params === "object" && "path" in params && typeof params.path === "string" ? params.path : "";
      if (rawPath) {
        pathsSeenBeforeEdit.add(resolveSandboxPathForSession(rawPath, sessionCwd));
      }
      return result;
    }
  };
  return write;
}
function buildSandboxedEditTool(ctx) {
  const { bash, sessionCwd, pathsSeenBeforeEdit, onDesignFile } = ctx;
  const editInner = createEditToolDefinition(sessionCwd, {
    operations: {
      readFile: async (absolutePath) => {
        const text = await bash.fs.readFile(absolutePath, "utf8");
        return Buffer.from(text, "utf8");
      },
      writeFile: async (absolutePath, content) => {
        await bash.fs.mkdir(path.posix.dirname(absolutePath), { recursive: true });
        await bash.fs.writeFile(absolutePath, content, "utf8");
        await emitDesignFileIfNeeded(absolutePath, bash, onDesignFile);
      },
      access: async (absolutePath) => {
        const ok = await bash.fs.exists(absolutePath);
        if (!ok) throw new Error("ENOENT");
      }
    }
  });
  const edit = {
    ...editInner,
    ...SANDBOX_TOOL_OVERRIDES.edit,
    execute: async (toolCallId, params, signal, onUpdate, extCtx) => {
      const rawPath = params != null && typeof params === "object" && "path" in params && typeof params.path === "string" ? params.path : "";
      const abs = resolveSandboxPathForSession(rawPath || ".", sessionCwd);
      const fileExists = await bash.fs.exists(abs);
      if (fileExists && !pathsSeenBeforeEdit.has(abs)) {
        throw new Error(
          `You must read "${rawPath}" before editing it. Use the read tool first to see the current file content.`
        );
      }
      try {
        return await editInner.execute(toolCallId, params, signal, onUpdate, extCtx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!isEditNotFoundError(msg)) throw err;
        const normalized = normalizeEditToolParams(params);
        if (!normalized) throw err;
        let fileContent;
        try {
          fileContent = await bash.fs.readFile(abs, "utf8");
        } catch {
          throw err;
        }
        const diagnostics = [];
        const corrected = attemptMatchCascade(fileContent, normalized.edits, diagnostics);
        if (!corrected) throw err;
        const retryParams = {
          path: normalized.path,
          edits: corrected
        };
        try {
          return await editInner.execute(toolCallId, retryParams, signal, onUpdate, extCtx);
        } catch {
          throw err;
        }
      }
    }
  };
  return edit;
}
function buildSandboxedLsTool(ctx) {
  const { bash, sessionCwd } = ctx;
  const lsInner = createLsToolDefinition(sessionCwd, {
    operations: {
      exists: (absolutePath) => bash.fs.exists(absolutePath),
      stat: async (absolutePath) => {
        const st = await bash.fs.stat(absolutePath);
        return { isDirectory: () => st.isDirectory };
      },
      readdir: async (absolutePath) => bash.fs.readdir(absolutePath)
    }
  });
  const ls = { ...lsInner, ...SANDBOX_TOOL_OVERRIDES.ls };
  return ls;
}
function buildSandboxedFindTool(ctx) {
  const { bash, sessionCwd } = ctx;
  const findInner = createFindToolDefinition(sessionCwd, {
    operations: {
      exists: (absolutePath) => bash.fs.exists(absolutePath),
      glob: async (pattern, searchPath, options) => {
        const limit = options.limit;
        const ignore = options.ignore ?? [];
        const prefix = searchPath.endsWith("/") ? searchPath : `${searchPath}/`;
        const allPaths = bash.fs.getAllPaths();
        const out = [];
        for (const abs of allPaths) {
          if (out.length >= limit) break;
          if (abs === searchPath) continue;
          if (!abs.startsWith(prefix)) continue;
          let st;
          try {
            st = await bash.fs.stat(abs);
          } catch {
            continue;
          }
          if (!st.isFile) continue;
          const rel = abs.startsWith(prefix) ? abs.slice(prefix.length) : abs;
          if (ignore.some((ig) => minimatch(rel, ig, { dot: true }))) continue;
          if (!minimatch(rel, pattern, { dot: true })) continue;
          out.push(abs);
        }
        return out;
      }
    }
  });
  const find = { ...findInner, ...SANDBOX_TOOL_OVERRIDES.find };
  return find;
}
function buildSandboxedGrepTool(ctx) {
  return createVirtualGrepTool(ctx.bash, ctx.sessionCwd);
}
const bashParams = Type.Object({
  command: Type.String({
    description: "Shell command in the just-bash sandbox (cwd is the project root). No package managers or host binaries — only built-in commands (e.g. rg, grep, sed, awk, jq, cat, find). Prefer read/write/edit tools for files; use bash for text pipelines or when no dedicated tool fits."
  })
});
function buildSandboxedBashTool(ctx) {
  return createSandboxBashTool(ctx.bash, ctx.onDesignFile);
}
function createSandboxBashTool(bash, onFile) {
  return {
    name: "bash",
    label: "bash",
    description: `Run a shell command in the just-bash virtual shell at ${SANDBOX_PROJECT_ROOT} (your cwd). This is not a full Linux machine: no npm, node, python, or external binaries — only just-bash built-ins (text tools like rg, grep, sed, awk, jq, pipes). For creating or editing design files, prefer the \`write\` and \`edit\` tools; use \`read\` instead of \`cat\`. Use bash for multi-step text pipelines or utilities when no dedicated tool fits.`,
    parameters: bashParams,
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { command } = params;
      const before = await snapshotDesignFiles(bash);
      const result = await bash.exec(command, { signal: signal ?? void 0 });
      const after = await snapshotDesignFiles(bash);
      for (const [rel, content] of after) {
        if (before.get(rel) !== content) {
          onFile(rel, content);
        }
      }
      const merged = [result.stdout, result.stderr].filter(Boolean).join("\n");
      const prefix = result.exitCode !== 0 ? `[exit ${result.exitCode}]
` : "";
      const body = merged || (result.exitCode !== 0 ? "(no stdout/stderr)" : "(no output)");
      const full = prefix + body;
      const text = full.length > SANDBOX_LIMITS.bashToolMaxChars ? `${full.slice(0, SANDBOX_LIMITS.bashToolMaxChars)}
[Output truncated at ${SANDBOX_LIMITS.bashToolMaxChars} characters]` : full;
      return {
        content: [{ type: "text", text }],
        details: null
      };
    }
  };
}
const SESSION_TAGS$1 = {
  design: ["design"],
  evaluation: ["evaluation"],
  incubation: ["incubation"],
  "inputs-gen": ["inputs-gen"],
  "design-system": ["design-system"]
};
const tagsCache = /* @__PURE__ */ new Map();
const defaultSkillTagLookup = async (skill) => {
  const cached = tagsCache.get(skill.filePath);
  if (cached) return cached;
  let body;
  try {
    body = await readFile(skill.filePath, "utf8");
  } catch {
    tagsCache.set(skill.filePath, []);
    return [];
  }
  const tags = parseTagsFromFrontmatter(body);
  tagsCache.set(skill.filePath, tags);
  return tags;
};
function parseTagsFromFrontmatter(body) {
  if (!body.startsWith("---")) return [];
  const end = body.indexOf("\n---", 3);
  if (end < 0) return [];
  const lines = body.slice(3, end).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inline = /^tags:\s*\[(.*?)\]\s*$/.exec(line);
    if (inline?.[1] !== void 0) return splitInlineTagList(inline[1]);
    if (/^tags:\s*$/.test(line)) {
      const out = [];
      for (let j = i + 1; j < lines.length; j++) {
        const item = /^\s*-\s*(.+?)\s*$/.exec(lines[j]);
        if (!item) break;
        out.push(item[1].replace(/^["']|["']$/g, "").trim());
      }
      return out;
    }
  }
  return [];
}
function splitInlineTagList(inner) {
  return inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter((s) => s.length > 0);
}
class SessionScopedResourceLoader {
  base;
  sessionTags;
  getSkillTags;
  cachedSkills;
  constructor(base, options) {
    this.base = base;
    this.sessionTags = options.sessionTags ?? SESSION_TAGS$1[options.sessionType];
    this.getSkillTags = options.getSkillTags ?? defaultSkillTagLookup;
  }
  /** Eagerly resolve the filtered skill list. Call once after the base loader's `reload()`. */
  async refreshSkills() {
    const { skills, diagnostics } = this.base.getSkills();
    const allowed = new Set(this.sessionTags);
    const kept = [];
    for (const skill of skills) {
      const tags = await this.getSkillTags(skill);
      if (tags.length === 0) continue;
      if (tags.some((t) => allowed.has(t))) {
        kept.push(skill);
      }
    }
    this.cachedSkills = { skills: kept, diagnostics };
  }
  /**
   * Replace each cached skill's `filePath` and `baseDir` with VFS-relative
   * paths so Pi's `formatSkillsForPrompt` prints sandbox-resolvable
   * `<location>` values. Call this after `refreshSkills()` and after
   * seeding the skills into the just-bash VFS.
   *
   * Skills not present in the remapping are left unchanged (their original
   * paths remain real-disk and `read` against them will fail inside the
   * sandbox by design).
   */
  applyPathRemapping(remapping) {
    if (!this.cachedSkills) {
      throw new Error(
        "applyPathRemapping called before refreshSkills() — call refreshSkills first to populate the cached skill list."
      );
    }
    const remapped = this.cachedSkills.skills.map((skill) => {
      const newFilePath = remapping.filePathByOriginalFilePath.get(skill.filePath);
      const newBaseDir = remapping.baseDirByOriginalBaseDir.get(skill.baseDir);
      if (!newFilePath && !newBaseDir) return skill;
      return {
        ...skill,
        ...newFilePath ? { filePath: newFilePath } : {},
        ...newBaseDir ? { baseDir: newBaseDir } : {}
      };
    });
    this.cachedSkills = { skills: remapped, diagnostics: this.cachedSkills.diagnostics };
  }
  getSkills() {
    return this.cachedSkills ?? this.base.getSkills();
  }
  getExtensions() {
    return this.base.getExtensions();
  }
  getPrompts() {
    return this.base.getPrompts();
  }
  getThemes() {
    return this.base.getThemes();
  }
  getAgentsFiles() {
    return this.base.getAgentsFiles();
  }
  getSystemPrompt() {
    return this.base.getSystemPrompt();
  }
  getAppendSystemPrompt() {
    return this.base.getAppendSystemPrompt();
  }
  extendResources(paths) {
    this.base.extendResources(paths);
  }
  async reload() {
    await this.base.reload();
    await this.refreshSkills();
  }
}
const GOOGLE_FONTS_CSS_HOSTS = ["fonts.googleapis.com"];
const GOOGLE_FONTS_ASSET_HOSTS = ["fonts.gstatic.com"];
function parseUrlHost(ref) {
  const raw = ref.trim();
  if (!raw || raw.startsWith("data:")) return null;
  try {
    if (raw.startsWith("//")) return new URL(`https:${raw}`).hostname.toLowerCase();
    if (/^https?:\/\//i.test(raw)) return new URL(raw).hostname.toLowerCase();
    return null;
  } catch {
    return null;
  }
}
function isAllowedGoogleFontStylesheetUrl(ref) {
  const host = parseUrlHost(ref);
  if (!host) return false;
  return GOOGLE_FONTS_CSS_HOSTS.some((h) => host === h);
}
function isAllowedGoogleFontAssetHost(ref) {
  const host = parseUrlHost(ref);
  if (!host) return false;
  return GOOGLE_FONTS_ASSET_HOSTS.some((h) => host === h);
}
function isAllowedGoogleFontsExternalRef(ref) {
  return isAllowedGoogleFontStylesheetUrl(ref) || isAllowedGoogleFontAssetHost(ref);
}
function resolveVirtualAssetPath$1(ref, htmlFilePath) {
  const clean = ref.split("#")[0].split("?")[0].trim();
  if (!clean) return void 0;
  if (/^(https?:)?\/\//i.test(clean) || clean.startsWith("data:")) return void 0;
  if (/^(mailto|javascript|tel):/i.test(clean)) return void 0;
  let joined;
  if (clean.startsWith("/")) {
    joined = clean.slice(1);
  } else {
    const lastSlash = htmlFilePath.lastIndexOf("/");
    const dir = lastSlash >= 0 ? htmlFilePath.slice(0, lastSlash) : "";
    joined = dir ? `${dir}/${clean}` : clean;
  }
  const segments = joined.split("/").filter((s) => s.length > 0 && s !== ".");
  const out = [];
  for (const seg of segments) {
    if (seg === "..") {
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}
function classifyAssetRef(ref) {
  const clean = ref.split("#")[0].split("?")[0].trim();
  if (/^(https?:)?\/\//i.test(clean) || clean.startsWith("data:")) return "external";
  if (clean.startsWith("/")) return "absolute";
  return "relative";
}
function extractCssImportUrls(css) {
  const urls = [];
  const urlParen = /@import\s+url\s*\(\s*["']?([^"')]+)["']?\s*\)\s*;?/gi;
  const quoted = /@import\s+["']([^"']+)["']\s*;?/gi;
  let m;
  while ((m = urlParen.exec(css)) !== null) {
    const u = m[1]?.trim();
    if (u) urls.push(u);
  }
  while ((m = quoted.exec(css)) !== null) {
    const u = m[1]?.trim();
    if (u) urls.push(u);
  }
  return urls;
}
async function validateHtmlWorkspaceContent(content, htmlPath, hasProjectFile2) {
  const issues = [];
  if (!/<!DOCTYPE\s+html/i.test(content)) {
    issues.push("Missing DOCTYPE declaration");
  }
  for (const tag of ["html", "head", "body"]) {
    if (!new RegExp(`<${tag}[\\s>]`, "i").test(content)) {
      issues.push(`Missing <${tag}> tag`);
    }
  }
  const scriptOpen = (content.match(/<script/gi) ?? []).length;
  const scriptClose = (content.match(/<\/script>/gi) ?? []).length;
  if (scriptOpen !== scriptClose) {
    issues.push(`Unbalanced <script> tags: ${scriptOpen} opening, ${scriptClose} closing`);
  }
  const styleOpen = (content.match(/<style/gi) ?? []).length;
  const styleClose = (content.match(/<\/style>/gi) ?? []).length;
  if (styleOpen !== styleClose) {
    issues.push(`Unbalanced <style> tags: ${styleOpen} opening, ${styleClose} closing`);
  }
  const stylesheetRefs = [
    ...content.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi)
  ].map((match) => match[1] ?? "");
  const scriptRefs = [
    ...content.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)
  ].map((match) => match[1] ?? "");
  for (const ref of stylesheetRefs) {
    const kind = classifyAssetRef(ref);
    if (kind === "external") {
      if (isAllowedGoogleFontStylesheetUrl(ref)) continue;
      issues.push(`External asset reference found: ${ref}`);
      continue;
    }
    if (kind === "absolute") {
      issues.push(`Use relative asset paths instead of root-absolute paths: ${ref}`);
    }
    const resolved = resolveVirtualAssetPath$1(ref, htmlPath);
    if (!resolved) continue;
    if (!await hasProjectFile2(resolved)) {
      issues.push(`Referenced asset not found in workspace: ${ref}`);
    }
  }
  for (const ref of scriptRefs) {
    const kind = classifyAssetRef(ref);
    if (kind === "external") {
      issues.push(`External asset reference found: ${ref}`);
      continue;
    }
    if (kind === "absolute") {
      issues.push(`Use relative asset paths instead of root-absolute paths: ${ref}`);
    }
    const resolved = resolveVirtualAssetPath$1(ref, htmlPath);
    if (!resolved) continue;
    if (!await hasProjectFile2(resolved)) {
      issues.push(`Referenced asset not found in workspace: ${ref}`);
    }
  }
  for (const styleMatch of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = styleMatch[1] ?? "";
    for (const importUrl of extractCssImportUrls(css)) {
      if (classifyAssetRef(importUrl) !== "external") continue;
      if (isAllowedGoogleFontsExternalRef(importUrl)) continue;
      issues.push(`External @import in <style> not allowed: ${importUrl}`);
    }
  }
  return issues;
}
const ID_ATTR = /\bid=["']([^"']+)["']/g;
const CLASS_ATTR = /\bclass=["']([^"']+)["']/g;
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
const GET_BY_ID = /getElementById\s*\(\s*["']([^"']+)["']\s*\)/g;
const QUERY_SEL_ID = /querySelector(?:All)?\s*\(\s*["']#([A-Za-z_][\w-]*)["']\s*\)/g;
const QUERY_SEL_CLASS = /querySelector(?:All)?\s*\(\s*["']\.([A-Za-z_][\w-]*)["']\s*\)/g;
const GET_BY_CLASS_NAME = /getElementsByClassName\s*\(\s*["']([A-Za-z_][\w-]*)["']\s*\)/g;
const JS_ID_ASSIGN = /\.id\s*=\s*["']([^"']+)["']/g;
const JS_SET_ATTR_ID = /setAttribute\s*\(\s*["']id["']\s*,\s*["']([^"']+)["']\s*\)/g;
const JS_CLASS_NAME_ASSIGN = /\.className\s*=\s*["']([^"']+)["']/g;
const JS_SET_ATTR_CLASS = /setAttribute\s*\(\s*["']class["']\s*,\s*["']([^"']+)["']\s*\)/g;
const JS_CLASSLIST_ADD = /\.classList\s*\.\s*(?:add|toggle|replace)\s*\(\s*["']([A-Za-z_][\w-]*)["']/g;
function isDynamicLiteral(value) {
  return value.includes("${") || value.includes("+");
}
function addClassTokens(target, value) {
  if (isDynamicLiteral(value)) return;
  for (const tok of value.split(/\s+/)) {
    if (tok.length > 0) target.add(tok);
  }
}
function checkArtifactCrossRefs(input) {
  const issues = [];
  const htmlIds = /* @__PURE__ */ new Set();
  const htmlClasses = /* @__PURE__ */ new Set();
  for (const m of input.htmlContent.matchAll(ID_ATTR)) {
    const id = m[1];
    if (!isDynamicLiteral(id)) htmlIds.add(id);
  }
  for (const m of input.htmlContent.matchAll(CLASS_ATTR)) {
    addClassTokens(htmlClasses, m[1]);
  }
  const inlineScripts = [];
  for (const m of input.htmlContent.matchAll(INLINE_SCRIPT)) {
    inlineScripts.push(m[1] ?? "");
  }
  const allJsSources = [
    ...input.jsFiles.map((f) => ({ src: f.content, label: f.path })),
    ...inlineScripts.map((src, i) => ({ src, label: `${input.htmlPath}#inline-script-${i + 1}` }))
  ];
  for (const { src } of allJsSources) {
    for (const m of src.matchAll(JS_ID_ASSIGN)) {
      const id = m[1];
      if (!isDynamicLiteral(id)) htmlIds.add(id);
    }
    for (const m of src.matchAll(JS_SET_ATTR_ID)) {
      htmlIds.add(m[1]);
    }
    for (const m of src.matchAll(JS_CLASS_NAME_ASSIGN)) {
      addClassTokens(htmlClasses, m[1]);
    }
    for (const m of src.matchAll(JS_SET_ATTR_CLASS)) {
      addClassTokens(htmlClasses, m[1]);
    }
    for (const m of src.matchAll(JS_CLASSLIST_ADD)) {
      htmlClasses.add(m[1]);
    }
  }
  for (const { src, label } of allJsSources) {
    for (const m of src.matchAll(GET_BY_ID)) {
      const id = m[1];
      if (!htmlIds.has(id)) {
        issues.push({
          kind: "unresolved-dom-id",
          reference: id,
          context: `${label}: getElementById('${id}')`
        });
      }
    }
    for (const m of src.matchAll(QUERY_SEL_ID)) {
      const id = m[1];
      if (!htmlIds.has(id)) {
        issues.push({
          kind: "unresolved-dom-id",
          reference: id,
          context: `${label}: querySelector('#${id}')`
        });
      }
    }
    for (const m of src.matchAll(QUERY_SEL_CLASS)) {
      const cls = m[1];
      if (!htmlClasses.has(cls)) {
        issues.push({
          kind: "unresolved-class",
          reference: cls,
          context: `${label}: querySelector('.${cls}')`
        });
      }
    }
    for (const m of src.matchAll(GET_BY_CLASS_NAME)) {
      const cls = m[1];
      if (!htmlClasses.has(cls)) {
        issues.push({
          kind: "unresolved-class",
          reference: cls,
          context: `${label}: getElementsByClassName('${cls}')`
        });
      }
    }
  }
  return issues;
}
async function readProjectFile(bash, rel) {
  const abs = sandboxProjectAbsPath(rel);
  try {
    if (!await bash.fs.exists(abs)) return void 0;
    const st = await bash.fs.stat(abs);
    if (!st.isFile) return void 0;
    return await bash.fs.readFile(abs, "utf8");
  } catch {
    return void 0;
  }
}
async function hasProjectFile(bash, rel) {
  const abs = sandboxProjectAbsPath(rel);
  try {
    if (!await bash.fs.exists(abs)) return false;
    const st = await bash.fs.stat(abs);
    return st.isFile;
  } catch {
    return false;
  }
}
function normalizeError$1(err) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
const todoWriteSchema = Type.Object({
  todos: Type.Array(
    Type.Object({
      id: Type.String({ description: 'Unique id (e.g. "1", "2").' }),
      task: Type.String({ description: "Task description." }),
      status: Type.Union([
        Type.Literal("pending"),
        Type.Literal("in_progress"),
        Type.Literal("completed")
      ])
    }),
    { description: "Full replacement todo list. Always write the complete current state." }
  )
});
function createTodoWriteTool(todoState, onTodos) {
  return {
    name: "todo_write",
    label: "todo_write",
    description: "Use `todo_write` to record or update your task list. Always provide the complete current state — full replacement, not incremental updates. Todos survive context compaction.",
    parameters: todoWriteSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { todos } = params;
      todoState.current = todos;
      onTodos(todos);
      const summary = todos.map((t) => {
        const icon = t.status === "completed" ? "✓" : t.status === "in_progress" ? "●" : "○";
        return `${icon} ${t.task}`;
      }).join("\n");
      return {
        content: [{ type: "text", text: `Todo list updated:
${summary}` }],
        details: null
      };
    }
  };
}
const validateJsSchema = Type.Object({
  path: Type.String({ description: 'Path of the JS file (e.g. "app.js").' })
});
function createValidateJsTool(bash) {
  return {
    name: "validate_js",
    label: "validate_js",
    description: "Use `validate_js` to check JavaScript syntax with the Node parser. Prefer running it after substantive edits to catch unbalanced braces, stray punctuation, or invalid syntax before the file goes back into the design.",
    parameters: validateJsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { path: path2 } = params;
      const content = await readProjectFile(bash, path2);
      if (content === void 0) {
        return { content: [{ type: "text", text: `File not found: ${path2}` }], details: null };
      }
      try {
        new Script(content, { filename: path2 });
        return { content: [{ type: "text", text: `${path2}: syntax OK` }], details: null };
      } catch (err) {
        return {
          content: [{ type: "text", text: `${path2}: ${normalizeError$1(err)}` }],
          details: null
        };
      }
    }
  };
}
const validateHtmlSchema = Type.Object({
  path: Type.String({ description: 'Path of the HTML file (e.g. "index.html").' })
});
function createValidateHtmlTool(bash) {
  return {
    name: "validate_html",
    label: "validate_html",
    description: "Use `validate_html` to run structural checks on an HTML file (DOCTYPE, html/head/body landmarks, balanced script and style tags, local asset references resolve, external refs blocked except the Google Fonts allowlist). Inline CSS and JS are allowed.",
    parameters: validateHtmlSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { path: path2 } = params;
      const content = await readProjectFile(bash, path2);
      if (content === void 0) {
        return { content: [{ type: "text", text: `File not found: ${path2}` }], details: null };
      }
      const issues = await validateHtmlWorkspaceContent(
        content,
        path2,
        (rel) => hasProjectFile(bash, rel)
      );
      const text = issues.length === 0 ? `${path2}: structure OK` : `${path2}: ${issues.length} issue(s)
${issues.map((i) => `- ${i}`).join("\n")}`;
      return { content: [{ type: "text", text }], details: null };
    }
  };
}
const validateArtifactSchema = Type.Object({
  entry: Type.Optional(
    Type.String({
      description: 'Entry HTML path (defaults to "index.html"). The tool follows its <script src> references to find associated JS files.'
    })
  )
});
function createValidateArtifactTool(bash) {
  return {
    name: "validate_artifact",
    label: "validate_artifact",
    description: 'Use `validate_artifact` to cross-check that every DOM id and single-class selector your JS references (getElementById, querySelector("#…"), querySelector(".…"), querySelectorAll, getElementsByClassName) exists in the entry HTML — or gets assigned dynamically by JS (`el.id = …`, `el.className = …`, `classList.add(…)`). The closest equivalent to `tsc` for this static-web project — catches dead-on-arrival handlers and stale selectors after substantive working-depth changes, before the artifact ships.',
    parameters: validateArtifactSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { entry = "index.html" } = params;
      const htmlContent = await readProjectFile(bash, entry);
      if (htmlContent === void 0) {
        return { content: [{ type: "text", text: `File not found: ${entry}` }], details: null };
      }
      const jsFiles = [];
      for (const match of htmlContent.matchAll(
        /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi
      )) {
        const ref = match[1] ?? "";
        if (classifyAssetRef(ref) !== "relative") continue;
        const resolved = resolveVirtualAssetPath$1(ref, entry);
        if (!resolved) continue;
        const content = await readProjectFile(bash, resolved);
        if (content !== void 0) jsFiles.push({ path: resolved, content });
      }
      const issues = checkArtifactCrossRefs({ htmlPath: entry, htmlContent, jsFiles });
      const text = issues.length === 0 ? `${entry}: cross-references resolve (${jsFiles.length} linked JS file${jsFiles.length === 1 ? "" : "s"} checked)` : `${entry}: ${issues.length} issue(s)
${issues.map((i) => `- ${i.context}`).join("\n")}`;
      return { content: [{ type: "text", text }], details: null };
    }
  };
}
class ToolSurfaceError extends Error {
  constructor(message) {
    super(message);
    this.name = "ToolSurfaceError";
  }
}
class ToolSurface {
  handlers = [];
  /** Add one handler. Returns `this` for chaining. */
  add(handler) {
    this.handlers.push(handler);
    return this;
  }
  /** Add many handlers. Returns `this` for chaining. */
  addAll(handlers) {
    for (const h of handlers) this.handlers.push(h);
    return this;
  }
  /**
   * Validate the surface against upstream Pi and produce session inputs.
   *
   * Throws `ToolSurfaceError` on any of:
   *   - Two handlers with the same name.
   *   - A `sandboxed-pi` or `excluded-pi` handler whose name is not in
   *     upstream Pi's `allToolNames`.
   *   - A Pi built-in with no handler at all.
   */
  build() {
    this.assertUniqueNames();
    const upstreamPiNames = readUpstreamPiBuiltinNames();
    this.assertPiHandlersMatchUpstream(upstreamPiNames);
    const registrations = [];
    const allowlist = [];
    for (const handler of this.handlers) {
      switch (handler.kind) {
        case "sandboxed-pi": {
          const tool = handler.build();
          if (tool.name !== handler.name) {
            throw new ToolSurfaceError(
              `Sandboxed Pi handler for '${handler.name}' produced a tool whose definition name is '${tool.name}'. Names must match — Pi resolves the override by name and the allowlist filters by name.`
            );
          }
          registrations.push((api) => api.registerTool(tool));
          allowlist.push(handler.name);
          break;
        }
        case "excluded-pi":
          break;
        case "auto-designer-extension":
          registrations.push(handler.register);
          allowlist.push(handler.name);
          break;
      }
    }
    const extensionFactory = (api) => {
      for (const register of registrations) register(api);
    };
    return { extensionFactory, allowlist };
  }
  assertUniqueNames() {
    const seen = /* @__PURE__ */ new Set();
    for (const h of this.handlers) {
      if (seen.has(h.name)) {
        throw new ToolSurfaceError(
          `Duplicate tool registration: '${h.name}' was added twice. Tool names must be unique across sandboxed-pi / excluded-pi / auto-designer-extension handlers.`
        );
      }
      seen.add(h.name);
    }
  }
  assertPiHandlersMatchUpstream(upstreamPiNames) {
    const handledPiNames = /* @__PURE__ */ new Set();
    for (const h of this.handlers) {
      if (h.kind !== "sandboxed-pi" && h.kind !== "excluded-pi") continue;
      if (!upstreamPiNames.has(h.name)) {
        throw new ToolSurfaceError(
          `Tool surface declares a Pi handler for '${h.name}', but upstream Pi (` + [...upstreamPiNames].sort().join(", ") + `) does not export a built-in by that name. Either remove the stale registration or correct the name.`
        );
      }
      handledPiNames.add(h.name);
    }
    const missing = [...upstreamPiNames].filter((name) => !handledPiNames.has(name));
    if (missing.length > 0) {
      throw new ToolSurfaceError(
        `Upstream Pi exposes built-in tool(s) with no disposition in this auto-designer tool surface: ${missing.map((n) => `'${n}'`).join(", ")}.

For each missing tool, add ONE of the following to the surface in src/host.ts:
  • { kind: 'sandboxed-pi', name: '<n>', build: () => <wrapped-tool> }
      — a wrapped Pi tool that talks to the just-bash VFS.
  • { kind: 'excluded-pi', name: '<n>', reason: '<why-not>' }
      — explicitly deny this tool to the model.

This error means a Pi upgrade introduced a new built-in. Until you decide which path to take, sessions will not start — by design.`
      );
    }
  }
}
let cachedUpstreamNames;
function readUpstreamPiBuiltinNames() {
  if (cachedUpstreamNames) return cachedUpstreamNames;
  const piEntryUrl = import.meta.resolve("@mariozechner/pi-coding-agent");
  const piEntry = fileURLToPath(piEntryUrl);
  const piPkgDistDir = dirname(piEntry);
  const toolsIndexPath = resolve(piPkgDistDir, "core/tools/index.js");
  let source;
  try {
    source = readFileSync(toolsIndexPath, "utf8");
  } catch (cause) {
    throw new ToolSurfaceError(
      `Could not read upstream Pi tools index at ${toolsIndexPath}. The package layout may have changed in this Pi version — update readUpstreamPiBuiltinNames() in src/internal/pi-tool-surface.ts. Underlying error: ${cause.message}`
    );
  }
  const match = source.match(/export\s+const\s+allToolNames\s*=\s*new\s+Set\(\[([^\]]*)\]\)/);
  if (!match) {
    throw new ToolSurfaceError(
      `Could not locate the \`allToolNames\` Set literal in ${toolsIndexPath}. Pi may have changed how it exposes its tool inventory — update readUpstreamPiBuiltinNames() in src/internal/pi-tool-surface.ts.`
    );
  }
  const names = match[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter((s) => s.length > 0);
  cachedUpstreamNames = new Set(names);
  return cachedUpstreamNames;
}
const DEFAULT_COMPLETION_BUDGET = {
  minCompletion: 1024,
  absoluteCeiling: 32768,
  margins: {
    incubate: 8192,
    compaction: 8192,
    agent_turn: 16384,
    default: 8192
  }
};
function completionBudgetFromPromptTokens$1(contextWindow, estimatedPromptTokens, purpose, productCap, config2 = DEFAULT_COMPLETION_BUDGET) {
  const cw = Math.max(4096, contextWindow);
  const margin = config2.margins[purpose];
  const prompt = Math.max(0, estimatedPromptTokens);
  const raw = cw - prompt - margin;
  if (raw < config2.minCompletion) return void 0;
  let b = Math.min(raw, config2.absoluteCeiling);
  if (productCap != null) b = Math.min(b, productCap);
  return Math.max(config2.minCompletion, b);
}
function maxCompletionBudgetForContextWindow(contextWindow, productCap, config2 = DEFAULT_COMPLETION_BUDGET) {
  const SESSION_CEILING_FALLBACK_MARGIN = 8192;
  const capped = completionBudgetFromPromptTokens$1(contextWindow, 0, "default", productCap, config2);
  if (capped != null) return capped;
  return Math.max(4096, Math.max(4096, contextWindow) - SESSION_CEILING_FALLBACK_MARGIN);
}
const ZEROED_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const DEFAULT_OPENROUTER_CONTEXT_WINDOW = 131072;
const DEFAULT_LMSTUDIO_CONTEXT_WINDOW = 32768;
function buildModel(opts) {
  const reasoning = !!opts.thinkingLevel && opts.thinkingLevel !== "off";
  const cwDefault = opts.provider.id === "lmstudio" ? DEFAULT_LMSTUDIO_CONTEXT_WINDOW : DEFAULT_OPENROUTER_CONTEXT_WINDOW;
  const contextWindow = Math.max(4096, opts.contextWindow ?? cwDefault);
  const maxTokens = maxCompletionBudgetForContextWindow(
    contextWindow,
    opts.maxOutputTokens,
    opts.budgetConfig ?? DEFAULT_COMPLETION_BUDGET
  );
  if (opts.provider.id === "lmstudio") {
    return {
      id: opts.modelId,
      name: opts.modelId,
      api: "openai-completions",
      provider: "lmstudio",
      baseUrl: `${opts.provider.baseUrl}/v1`,
      reasoning,
      input: ["text"],
      cost: ZEROED_COST,
      contextWindow,
      maxTokens
    };
  }
  return {
    id: opts.modelId,
    name: opts.modelId,
    api: "openai-completions",
    provider: "openrouter",
    baseUrl: opts.provider.baseUrl,
    reasoning,
    input: ["text"],
    cost: ZEROED_COST,
    contextWindow,
    maxTokens
  };
}
function findLastAssistantMessage$1(messages) {
  if (!Array.isArray(messages)) return void 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && typeof m === "object" && m.role === "assistant") {
      return m;
    }
  }
  return void 0;
}
function subscribeNarrowBridge(session, opts) {
  const toolStartMs = /* @__PURE__ */ new Map();
  return session.subscribe((event) => {
    switch (event.type) {
      case "turn_start":
        return void opts.onEvent({ type: "turn_start" });
      case "turn_end":
        return void opts.onEvent({ type: "turn_end" });
      case "tool_execution_start": {
        const e = event;
        toolStartMs.set(e.toolCallId, Date.now());
        return void opts.onEvent({
          type: "tool_execution_start",
          toolCallId: e.toolCallId,
          toolName: e.toolName
        });
      }
      case "tool_execution_end": {
        const e = event;
        const start = toolStartMs.get(e.toolCallId);
        toolStartMs.delete(e.toolCallId);
        return void opts.onEvent({
          type: "tool_execution_end",
          toolCallId: e.toolCallId,
          toolName: e.toolName,
          durationMs: start ? Date.now() - start : 0
        });
      }
      case "compaction_start": {
        const e = event;
        return void opts.onEvent({ type: "compaction_start", reason: e.reason });
      }
      case "compaction_end": {
        const e = event;
        return void opts.onEvent({
          type: "compaction_end",
          reason: e.reason,
          aborted: e.aborted,
          willRetry: e.willRetry,
          errorMessage: e.errorMessage,
          summaryChars: e.result?.summary.length
        });
      }
      case "agent_end": {
        const e = event;
        const last = findLastAssistantMessage$1(e.messages);
        const aborted = last?.stopReason === "aborted";
        const errorMessage = last?.stopReason === "error" ? last?.errorMessage : void 0;
        return void opts.onEvent({ type: "agent_end", aborted, errorMessage });
      }
      default:
        return;
    }
  });
}
const APP_RETRYABLE_UPSTREAM_PATTERN = /upstream|5\d{2}|NaN|provider.*error|gateway/i;
function isAppRetryableUpstreamError(message) {
  if (!message?.trim()) return false;
  if (/insufficient credits|out of credits|credits are exhausted|402/i.test(message)) return false;
  return APP_RETRYABLE_UPSTREAM_PATTERN.test(message);
}
function sleepMs(ms) {
  return new Promise((resolve2) => {
    setTimeout(resolve2, ms);
  });
}
const SANDBOX_SKILLS_SUBDIR = ".skills";
const SANDBOX_SKILLS_DIR = `${SANDBOX_PROJECT_ROOT}/${SANDBOX_SKILLS_SUBDIR}`;
function vfsSkillFilePath(skillName, fileName = "SKILL.md") {
  const safeName = path.posix.basename(skillName);
  const safeFile = path.posix.basename(fileName);
  return `${SANDBOX_SKILLS_DIR}/${safeName}/${safeFile}`;
}
function vfsSkillBaseDir(skillName) {
  return `${SANDBOX_SKILLS_DIR}/${path.posix.basename(skillName)}`;
}
async function seedSkillsIntoSandbox(bash, skills) {
  const filePathByOriginalFilePath = /* @__PURE__ */ new Map();
  const baseDirByOriginalBaseDir = /* @__PURE__ */ new Map();
  for (const skill of skills) {
    let body;
    try {
      body = await readFile(skill.filePath, "utf8");
    } catch {
      continue;
    }
    const vfsFile = vfsSkillFilePath(skill.name, path.posix.basename(skill.filePath));
    const vfsDir = vfsSkillBaseDir(skill.name);
    await bash.fs.mkdir(vfsDir, { recursive: true });
    await bash.fs.writeFile(vfsFile, body, "utf8");
    filePathByOriginalFilePath.set(skill.filePath, vfsFile);
    baseDirByOriginalBaseDir.set(skill.baseDir, vfsDir);
  }
  return { filePathByOriginalFilePath, baseDirByOriginalBaseDir };
}
const MAX_APP_UPSTREAM_RETRIES = 2;
function buildDesignToolSurface(args) {
  const { bash, sandboxCtx, todoState, onTodos } = args;
  return new ToolSurface().add({ kind: "sandboxed-pi", name: "read", build: () => buildSandboxedReadTool(sandboxCtx) }).add({ kind: "sandboxed-pi", name: "write", build: () => buildSandboxedWriteTool(sandboxCtx) }).add({ kind: "sandboxed-pi", name: "edit", build: () => buildSandboxedEditTool(sandboxCtx) }).add({ kind: "sandboxed-pi", name: "ls", build: () => buildSandboxedLsTool(sandboxCtx) }).add({ kind: "sandboxed-pi", name: "find", build: () => buildSandboxedFindTool(sandboxCtx) }).add({ kind: "sandboxed-pi", name: "grep", build: () => buildSandboxedGrepTool(sandboxCtx) }).add({ kind: "sandboxed-pi", name: "bash", build: () => buildSandboxedBashTool(sandboxCtx) }).add({
    kind: "auto-designer-extension",
    name: "todo_write",
    register: (api) => api.registerTool(createTodoWriteTool(todoState, onTodos))
  }).add({
    kind: "auto-designer-extension",
    name: "validate_js",
    register: (api) => api.registerTool(createValidateJsTool(bash))
  }).add({
    kind: "auto-designer-extension",
    name: "validate_html",
    register: (api) => api.registerTool(createValidateHtmlTool(bash))
  }).add({
    kind: "auto-designer-extension",
    name: "validate_artifact",
    register: (api) => api.registerTool(createValidateArtifactTool(bash))
  });
}
async function runPromptWithUpstreamRetries(session, userPrompt) {
  await session.prompt(userPrompt, { expandPromptTemplates: false });
  let attempts = 0;
  while (attempts < MAX_APP_UPSTREAM_RETRIES) {
    const messages = session.agent.state.messages;
    const lastAssistant = findLastAssistantMessage$1(messages);
    if (!lastAssistant || lastAssistant.stopReason !== "error") return;
    if (!isAppRetryableUpstreamError(lastAssistant.errorMessage)) return;
    if (session.retryAttempt !== 0) return;
    attempts += 1;
    if (messages.length > 0 && messages[messages.length - 1].role === "assistant") {
      session.agent.state.messages = messages.slice(0, -1);
    }
    await sleepMs(2e3 * 2 ** (attempts - 1));
    await session.agent.continue();
  }
}
async function createSession(opts) {
  const bash = createAgentBashSandbox({ seedFiles: opts.seedFiles });
  const todoState = { current: [] };
  const emittedFilePaths = /* @__PURE__ */ new Set();
  const onFile = (path2, content) => {
    emittedFilePaths.add(path2);
    opts.onFile?.(path2, content);
  };
  const onTodos = (todos) => {
    todoState.current = todos;
    opts.onTodos?.(todos);
  };
  const sandboxCtx = createSandboxToolContext(bash, onFile);
  const surface = buildDesignToolSurface({ bash, sandboxCtx, todoState, onTodos });
  const built = surface.build();
  const baseLoader = await opts.buildResourceLoader({
    sessionType: opts.sessionType,
    extensionFactories: [built.extensionFactory]
  });
  const scopedLoader = new SessionScopedResourceLoader(baseLoader, {
    sessionType: opts.sessionType,
    getSkillTags: opts.getSkillTags
  });
  await scopedLoader.refreshSkills();
  const seededRemapping = await seedSkillsIntoSandbox(bash, scopedLoader.getSkills().skills);
  scopedLoader.applyPathRemapping(seededRemapping);
  const authStorage = AuthStorage.inMemory();
  if (opts.provider.id === "openrouter") {
    authStorage.setRuntimeApiKey("openrouter", opts.provider.apiKey);
  } else {
    authStorage.setRuntimeApiKey("lmstudio", "local");
  }
  const model = buildModel({
    provider: opts.provider,
    modelId: opts.modelId,
    contextWindow: opts.contextWindow,
    thinkingLevel: opts.thinkingLevel
  });
  const { session } = await createAgentSession({
    authStorage,
    model,
    thinkingLevel: opts.thinkingLevel ?? "medium",
    /**
     * `tools:` is the explicit allowlist of names the model can call. Every
     * tool — sandboxed Pi overrides AND auto-designer extensions — was
     * registered through `pi.registerTool` in the extension factory above
     * (the canonical pattern documented in extensions.md "Overriding
     * Built-in Tools" and SDK example 06-extensions.ts). Pi resolves
     * override-by-name in agent-session.js:_refreshToolRegistry, so the
     * built-in `read`/`write`/etc. that touch the real disk are replaced
     * by our VFS-backed versions before the model ever sees them.
     */
    tools: [...built.allowlist],
    sessionManager: SessionManager.inMemory(),
    cwd: SANDBOX_PROJECT_ROOT,
    resourceLoader: scopedLoader
  });
  const unsubscribe = opts.onEvent ? subscribeNarrowBridge(session, { onEvent: opts.onEvent }) : () => {
  };
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => void session.agent.abort());
  }
  let endResult = { aborted: false };
  const captureUnsub = subscribeNarrowBridge(session, {
    onEvent: (e) => {
      if (e.type === "agent_end") {
        endResult = { aborted: e.aborted, errorMessage: e.errorMessage };
      }
    }
  });
  let started = false;
  return {
    sessionId: session.sessionId,
    session,
    abort: async () => {
      await session.agent.abort();
    },
    run: async () => {
      if (started) throw new Error("SessionHandle.run() is single-shot");
      started = true;
      try {
        const userMessage = `${opts.userPrompt}

[Workspace root: ${SANDBOX_PROJECT_ROOT} — use read, write, edit, ls, find, and grep for files; use bash for shell/commands.]`;
        await runPromptWithUpstreamRetries(session, userMessage);
      } finally {
        unsubscribe();
        captureUnsub();
      }
      const files = await extractDesignFiles(bash);
      return {
        files,
        todos: [...todoState.current],
        emittedFilePaths: [...emittedFilePaths],
        aborted: endResult.aborted,
        errorMessage: endResult.errorMessage
      };
    }
  };
}
function createDesignSession(opts) {
  return createSession({ ...opts, sessionType: "design" });
}
function createEvaluationSession(opts) {
  return createSession({ ...opts, sessionType: "evaluation" });
}
function createIncubationSession(opts) {
  return createSession({ ...opts, sessionType: "incubation" });
}
function createInputsGenSession(opts) {
  return createSession({ ...opts, sessionType: "inputs-gen" });
}
function createDesignSystemSession(opts) {
  return createSession({ ...opts, sessionType: "design-system" });
}
const __dirname$1 = dirname(fileURLToPath(import.meta.url));
function locatePackageRoot() {
  const candidates = [
    resolve(__dirname$1, ".."),
    resolve(process.cwd(), "packages", "auto-designer-pi"),
    process.cwd()
  ];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, "prompts", "_designer-system.md"))) {
      return candidate;
    }
  }
  return candidates[0];
}
const PACKAGE_ROOT = locatePackageRoot();
const PACKAGE_SKILLS_DIR = resolve(PACKAGE_ROOT, "skills");
const PACKAGE_PROMPTS_DIR = resolve(PACKAGE_ROOT, "prompts");
resolve(PACKAGE_ROOT, "extensions");
const PACKAGE_DESIGNER_SYSTEM_PROMPT_PATH = resolve(PACKAGE_PROMPTS_DIR, "_designer-system.md");
function stripFrontmatter(text) {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return text;
  return text.slice(end + 4).replace(/^\n+/, "");
}
function loadDesignerSystemPrompt() {
  return stripFrontmatter(readFileSync(PACKAGE_DESIGNER_SYSTEM_PROMPT_PATH, "utf8")).trim();
}
function loadPackagePromptBody(filename) {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "");
  const full = resolve(PACKAGE_PROMPTS_DIR, safe);
  return stripFrontmatter(readFileSync(full, "utf8")).trim();
}
const INCUBATOR_USER_INPUTS_TEMPLATE = `Analyze the following design specification and produce global exploration axes with hypothesis strategies.

<specification>
{{INTERNAL_CONTEXT}}
</specification>

Produce the exploration-axis map as JSON.{{REFERENCE_DESIGNS_BLOCK}}{{EXISTING_HYPOTHESES_BLOCK}}{{INCUBATOR_HYPOTHESIS_COUNT_LINE}}`;
const DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE = `The sections below supply one hypothesis, product execution instructions, and the full specification—in that order.

<hypothesis>
<name>{{STRATEGY_NAME}}</name>
<bet>{{HYPOTHESIS}}</bet>
<rationale>{{RATIONALE}}</rationale>
<measurements>{{MEASUREMENTS}}</measurements>
<exploration_axes>
{{EXPLORATION_AXES}}
</exploration_axes>
<dimension_values>
{{DIMENSION_VALUES}}
</dimension_values>
</hypothesis>

<design_agent_instructions>
{{DESIGN_AGENT_INSTRUCTIONS}}
</design_agent_instructions>

<specification>

<design_brief>
{{DESIGN_BRIEF}}
</design_brief>

<research_context>
{{RESEARCH_CONTEXT}}
</research_context>

<objectives_metrics>
{{OBJECTIVES_METRICS}}
</objectives_metrics>

<design_constraints>
{{DESIGN_CONSTRAINTS}}
</design_constraints>

<design_system>
{{DESIGN_SYSTEM}}
</design_system>

</specification>`;
const GLUE_TEMPLATES = {
  "incubator-user-inputs": INCUBATOR_USER_INPUTS_TEMPLATE,
  "designer-hypothesis-inputs": DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE
};
const PACKAGE_PROMPT_FILES = {
  "hypotheses-generator-system": "gen-hypotheses.md",
  "evaluator-design-quality": "eval-design-quality.md",
  "evaluator-strategy-fidelity": "eval-strategy-fidelity.md",
  "evaluator-implementation": "eval-implementation.md",
  "inputs-gen-research-context": "gen-research.md",
  "inputs-gen-objectives-metrics": "gen-objectives.md",
  "inputs-gen-design-constraints": "gen-constraints.md",
  "incubator-brainstorm-system": "gen-brainstorm.md",
  "incubator-curation-system": "gen-curation.md",
  "design-system-extract-system": "ds-extract.md",
  "design-system-extract-user-input": "ds-extract-input.md",
  "designer-agentic-revision-user": "revise.md",
  "designer-agent-instructions": "design-agent-instructions.md"
};
async function getPromptBody(key) {
  if (key === "designer-agentic-system") {
    return loadDesignerSystemPrompt();
  }
  const glue = GLUE_TEMPLATES[key];
  if (glue !== void 0) return glue;
  const packageFile = PACKAGE_PROMPT_FILES[key];
  if (packageFile !== void 0) return loadPackagePromptBody(packageFile);
  throw new Error(`getPromptBody: unhandled PromptKey "${key}"`);
}
async function inlineGuidance(key, tag) {
  const body = await getPromptBody(key);
  return `<${tag}>
${body}
</${tag}>`;
}
const lockdown = "auto";
const autoImprove = 0;
const rawFlags = {
  lockdown,
  autoImprove
};
const __vite_import_meta_env__$1 = { "PROD": true };
const flag = z.union([z.literal(0), z.literal(1), z.literal("auto")]);
const FeatureFlagsFileSchema = z.object({
  lockdown: flag,
  autoImprove: flag
}).strict();
const FLAGS = FeatureFlagsFileSchema.parse(rawFlags);
function isProductionEnv() {
  const meta = typeof import.meta !== "undefined" ? __vite_import_meta_env__$1 ?? null : null;
  if (meta && typeof meta.PROD === "boolean") return meta.PROD;
  const proc = globalThis.process;
  if (proc && proc.env) {
    return proc.env.NODE_ENV === "production";
  }
  return false;
}
function resolveFlag(value) {
  if (value === 1) return true;
  if (value === 0) return false;
  return isProductionEnv();
}
const FEATURE_LOCKDOWN = resolveFlag(FLAGS.lockdown);
const FEATURE_AUTO_IMPROVE = resolveFlag(FLAGS.autoImprove);
const perTaskDefaults$1 = { "design": { "providerId": "openrouter", "modelId": "deepseek/deepseek-v4.1-flash" }, "incubate": { "providerId": "openrouter", "modelId": "deepseek/deepseek-v4.1-flash" }, "inputs": { "providerId": "openrouter", "modelId": "deepseek/deepseek-v4.1-flash" }, "design-system": { "providerId": "openrouter", "modelId": "deepseek/deepseek-v4.1-flash" }, "evaluator": { "providerId": "openrouter", "modelId": "deepseek/deepseek-v4.1-flash" } };
const rawTaskDefaults = {
  perTaskDefaults: perTaskDefaults$1
};
const perTaskDefaults = { "design": { "level": "high", "budgetTokens": 2e4 }, "incubate": { "level": "high", "budgetTokens": 2e4 }, "inputs": { "level": "medium", "budgetTokens": 5e3 }, "design-system": { "level": "high", "budgetTokens": 2e4 }, "evaluator": { "level": "low", "budgetTokens": 2048 } };
const budgetByLevel = { "off": 0, "minimal": 1024, "low": 2048, "medium": 5e3, "high": 2e4, "xhigh": 32768 };
const budgetBounds = { "minTokens": 1024, "maxTokens": 32768 };
const rawConfig = {
  perTaskDefaults,
  budgetByLevel,
  budgetBounds
};
const REASONING_PATTERNS = [
  /\bo[1-9]\b/i,
  /claude-3[-.]5/i,
  /claude-3[-.]7/i,
  /claude-4/i,
  /deepseek-r1/i,
  /deepseek-reasoner/i,
  /deepseek-v4/i,
  /minimax-m2\.7/i,
  /\bqwq\b/i,
  /qwen3/i,
  /-thinking\b/i
];
function supportsReasoningModel(id) {
  return REASONING_PATTERNS.some((re) => re.test(id));
}
const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh"
];
const THINKING_TASKS = [
  "design",
  "incubate",
  "inputs",
  "design-system",
  "evaluator"
];
const THINKING_OFF = { level: "off", budgetTokens: 0 };
const ThinkingLevelSchema = z.enum(THINKING_LEVELS);
z.enum(THINKING_TASKS);
const ThinkingConfigSchema = z.object({
  level: ThinkingLevelSchema,
  budgetTokens: z.number().int().min(0)
});
const ThinkingOverrideSchema = z.object({
  level: ThinkingLevelSchema,
  budgetTokens: z.number().int().min(0)
}).strict();
const perTaskDefaultsShape = Object.fromEntries(
  THINKING_TASKS.map((task) => [task, ThinkingConfigSchema])
);
const budgetByLevelShape = Object.fromEntries(
  THINKING_LEVELS.map((level) => [level, z.number().int().min(0)])
);
const ThinkingDefaultsFileSchema = z.object({
  perTaskDefaults: z.object(perTaskDefaultsShape).strict(),
  budgetByLevel: z.object(budgetByLevelShape).strict(),
  budgetBounds: z.object({
    minTokens: z.number().int().min(1),
    maxTokens: z.number().int().min(1024)
  }).strict().refine((b) => b.maxTokens >= b.minTokens, {
    message: "budgetBounds.maxTokens must be >= budgetBounds.minTokens"
  })
}).strict();
const CONFIG = ThinkingDefaultsFileSchema.parse(rawConfig);
const THINKING_BUDGET_MIN_TOKENS = CONFIG.budgetBounds.minTokens;
const THINKING_BUDGET_MAX_TOKENS = CONFIG.budgetBounds.maxTokens;
const THINKING_BUDGET_BY_LEVEL = CONFIG.budgetByLevel;
const THINKING_CONFIG_DEFAULTS = CONFIG.perTaskDefaults;
function clampBudget(n) {
  if (Number.isNaN(n)) return THINKING_BUDGET_MIN_TOKENS;
  if (n >= THINKING_BUDGET_MAX_TOKENS) return THINKING_BUDGET_MAX_TOKENS;
  if (n <= THINKING_BUDGET_MIN_TOKENS) return THINKING_BUDGET_MIN_TOKENS;
  return Math.round(n);
}
function resolveThinkingConfig(task, modelId, override) {
  if (!modelId || !supportsReasoningModel(modelId)) return THINKING_OFF;
  const defaults = THINKING_CONFIG_DEFAULTS[task];
  const level = override?.level ?? defaults.level;
  if (level === "off") return THINKING_OFF;
  const rawBudget2 = override?.budgetTokens ?? THINKING_BUDGET_BY_LEVEL[level];
  return { level, budgetTokens: clampBudget(rawBudget2) };
}
const TaskModelDefaultSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1)
});
const TaskDefaultsFileSchema = z.object({
  perTaskDefaults: z.record(z.string(), TaskModelDefaultSchema)
}).strict();
const parsedTaskDefaults = TaskDefaultsFileSchema.parse(rawTaskDefaults);
for (const task of THINKING_TASKS) {
  if (!parsedTaskDefaults.perTaskDefaults[task]) {
    throw new Error(`config/task-defaults.json missing perTaskDefaults.${task}`);
  }
}
const TASK_DEFAULTS = parsedTaskDefaults.perTaskDefaults;
function getTaskModelDefault(task) {
  return TASK_DEFAULTS[task];
}
function getLockdownModelForTask(task) {
  return getTaskModelDefault(task);
}
function pinForLockdown(input, lockdown2, task) {
  if (Array.isArray(input)) {
    if (!lockdown2) return input.map((c) => ({ ...c }));
    const pin = getLockdownModelForTask(task);
    return input.map((c) => ({ ...c, providerId: pin.providerId, modelId: pin.modelId }));
  }
  const pair = input;
  if (!lockdown2) return { ...pair };
  return getLockdownModelForTask(task);
}
function isLockdownEnabled() {
  return FEATURE_LOCKDOWN;
}
function clampProviderModel(providerId, modelId, task) {
  return pinForLockdown({ providerId, modelId }, isLockdownEnabled(), task);
}
function clampEvaluatorOptional(evaluatorProviderId, evaluatorModelId) {
  if (!isLockdownEnabled()) {
    return { evaluatorProviderId, evaluatorModelId };
  }
  const pin = getLockdownModelForTask("evaluator");
  return {
    evaluatorProviderId: pin.providerId,
    evaluatorModelId: pin.modelId
  };
}
function applyLockdownToHypothesisContext(ctx) {
  return {
    ...ctx,
    modelCredentials: pinForLockdown(ctx.modelCredentials, isLockdownEnabled(), "design")
  };
}
function apiJsonError(c, status, message, details) {
  const body = { error: message };
  if (details !== void 0) {
    body.details = details;
  }
  return c.json(body, status);
}
async function parseRequestJson(c, schema, options) {
  let raw;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, response: apiJsonError(c, 400, "Invalid JSON body") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    if (process.env.NODE_ENV !== "production" && options?.devWarnLabel) {
      console.warn(options.devWarnLabel, "validation failed", details);
    }
    return { ok: false, response: apiJsonError(c, 400, "Invalid request", details) };
  }
  return { ok: true, data: parsed.data };
}
const SSE_EVENT_NAMES = {
  progress: "progress",
  activity: "activity",
  thinking: "thinking",
  streaming_tool: "streaming_tool",
  trace: "trace",
  code: "code",
  error: "error",
  file: "file",
  plan: "plan",
  todos: "todos",
  phase: "phase",
  evaluation_progress: "evaluation_progress",
  evaluation_worker_done: "evaluation_worker_done",
  evaluation_report: "evaluation_report",
  revision_round: "revision_round",
  skills_loaded: "skills_loaded",
  skill_activated: "skill_activated",
  checkpoint: "checkpoint",
  lane_done: "lane_done",
  done: "done",
  /** POST /api/incubate final incubation plan (after streaming deltas). */
  incubate_result: "incubate_result",
  /** Generic agentic task result — carries the extracted output from the sandbox. */
  task_result: "task_result"
};
function parseJsonLenient(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch {
    try {
      return JSON.parse(jsonrepair(jsonStr));
    } catch {
      throw new Error("Invalid JSON after repair attempt");
    }
  }
}
function extractLlmJsonObjectSegment(raw, options) {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) return s.slice(start, end + 1);
  if (options?.requireObject) {
    throw new Error(options.emptyMessage ?? "No JSON object in model output");
  }
  return s;
}
const TEMPLATE_ECHO_PREFIX = /^string\s*[—–-]\s*/i;
function incubationFirstHypothesisEmpty(plan) {
  const h = plan.hypotheses[0];
  if (!h) return true;
  return !h.hypothesis.trim();
}
function incubationLooksLikeTemplateEcho(plan) {
  for (const d of plan.dimensions) {
    if (TEMPLATE_ECHO_PREFIX.test(d.name.trim()) || TEMPLATE_ECHO_PREFIX.test(String(d.range).trim())) {
      return true;
    }
  }
  for (const h of plan.hypotheses) {
    if (TEMPLATE_ECHO_PREFIX.test(h.name.trim()) || TEMPLATE_ECHO_PREFIX.test(h.hypothesis.trim()) || TEMPLATE_ECHO_PREFIX.test(h.rationale.trim())) {
      return true;
    }
  }
  return false;
}
const DEFAULT_DEV_API_PORT = 4731;
const DEFAULT_DEV_CLIENT_PORT = 4732;
config({ path: ".env.local" });
config({ path: ".env" });
function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
function optionalScore(value) {
  if (value === void 0 || value === "") return void 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return void 0;
  return n;
}
function clampIndEnv(value, fallback, min, max) {
  if (value === void 0 || String(value).trim() === "") return fallback;
  return clampInt(value, fallback, min, max);
}
const env = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai",
  LMSTUDIO_URL: process.env.LMSTUDIO_URL ?? process.env.VITE_LMSTUDIO_URL ?? "http://localhost:1234",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  get isDev() {
    return this.NODE_ENV !== "production";
  },
  /**
   * Comma-separated browser origins allowed for CORS (e.g. `https://app.vercel.app`).
   * When empty, only localhost dev origins are allowed. Set on production when the SPA is on
   * a custom domain or Vercel preview URL that is not same-origin as the API.
   */
  get ALLOWED_ORIGINS() {
    return (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  },
  /**
   * Optional hard cap on **completion** tokens in outbound API bodies and Pi `streamSimple`.
   * When unset/empty, HTTP clients omit `max_tokens` (OpenRouter uses each model’s maximum)
   * and Pi uses a budget derived from the model context window.
   */
  get MAX_OUTPUT_TOKENS() {
    const raw = process.env.MAX_OUTPUT_TOKENS;
    if (raw === void 0 || String(raw).trim() === "") return void 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return void 0;
    return Math.min(Math.trunc(n), 2097152);
  },
  /**
   * Assumed context window for LM Studio when `/models` does not report one (local runners).
   */
  LM_STUDIO_CONTEXT_WINDOW: clampInt(process.env.LM_STUDIO_CONTEXT_WINDOW, 131072, 4096, 2097152),
  /** Max PI revision sessions after first eval (agentic). */
  AGENTIC_MAX_REVISION_ROUNDS: clampInt(process.env.AGENTIC_MAX_REVISION_ROUNDS, 5, 0, 20),
  /** Optional early satisfaction when overall score ≥ this and no hard fails. */
  AGENTIC_MIN_OVERALL_SCORE: optionalScore(process.env.AGENTIC_MIN_OVERALL_SCORE),
  /** Dev LLM observability log (`/api/logs`): max rows kept in memory (FIFO drop). */
  LLM_LOG_MAX_ENTRIES: clampInt(process.env.LLM_LOG_MAX_ENTRIES, 400, 50, 1e4),
  /** Ephemeral preview sessions (`/api/preview/sessions`); oldest evicted when over cap. */
  MAX_PREVIEW_SESSIONS: clampIndEnv(process.env.MAX_PREVIEW_SESSIONS, 200, 1, 5e4),
  /** Max approx UTF-8 bytes for POST/PUT preview `files` map (rejects with 413). */
  MAX_PREVIEW_PAYLOAD_BYTES: clampIndEnv(
    process.env.MAX_PREVIEW_PAYLOAD_BYTES,
    5 * 1024 * 1024,
    64 * 1024,
    50 * 1024 * 1024
  ),
  /** Max concurrent agentic orchestration runs per server instance (503 when full). */
  MAX_CONCURRENT_AGENTIC_RUNS: clampIndEnv(process.env.MAX_CONCURRENT_AGENTIC_RUNS, 5, 1, 100),
  /**
   * Override directory for observability NDJSON. Falls back to `LLM_LOG_DIR`, then in development
   * defaults to `logs/observability` under `process.cwd()`. Empty in production unless explicitly set.
   */
  get OBSERVABILITY_LOG_BASE_DIR() {
    const explicit = (process.env.OBSERVABILITY_LOG_DIR ?? "").trim() || (process.env.LLM_LOG_DIR ?? "").trim();
    if (explicit) return explicit;
    if (process.env.VITEST === "true") return "";
    if (process.env.NODE_ENV === "production") return "";
    return path.join(process.cwd(), "logs", "observability");
  },
  /** @deprecated Use OBSERVABILITY_LOG_BASE_DIR (same resolution when set). Kept for docs/tools. */
  LLM_LOG_DIR: (process.env.LLM_LOG_DIR ?? "").trim(),
  /**
   * Max characters per systemPrompt, userPrompt, response in the NDJSON file sink only.
   * In production, defaults to **2000** when unset (defensive); set `0` for no cap.
   */
  get LLM_LOG_MAX_BODY_CHARS() {
    const raw = process.env.LLM_LOG_MAX_BODY_CHARS;
    if (raw === void 0 || String(raw).trim() === "") {
      if (process.env.NODE_ENV === "production") return 2e3;
      return 0;
    }
    return clampInt(raw, 0, 0, 1e7);
  },
  /** `daily` → `llm-YYYY-MM-DD.ndjson`; `single` → `llm.ndjson`. */
  LLM_LOG_FILE_MODE: process.env.LLM_LOG_FILE_MODE === "single" ? "single" : "daily",
  /** Set to `0` to skip Playwright browser-grounded eval (preflight only). Disabled under Vitest by default. */
  get BROWSER_PLAYWRIGHT_EVAL() {
    if (process.env.VITEST === "true") return false;
    return process.env.BROWSER_PLAYWRIGHT_EVAL !== "0";
  },
  /**
     * Public origin for server-side preview URLs (Playwright, eval). No trailing slash.
     * Defaults to 127.0.0.1 + PORT so headless browsers hit the same process as the API.
     */
  PREVIEW_PUBLIC_URL: (process.env.PREVIEW_PUBLIC_URL ?? "").trim().replace(/\/$/, ""),
  get previewPublicBaseUrl() {
    const explicit = this.PREVIEW_PUBLIC_URL.trim();
    if (explicit) return explicit;
    const port = (process.env.PORT ?? String(DEFAULT_DEV_API_PORT)).trim();
    return `http://127.0.0.1:${port}`;
  }
};
let debounceTimer = null;
const DEBOUNCE_MS = 500;
const readers = {};
function configureAgentLogSnapshotReaders(nextReaders) {
  Object.assign(readers, nextReaders);
}
function buildAgentLogSnapshotPayload() {
  const getLogEntries2 = readers.getLogEntries ?? (() => []);
  const getTraceLogLines2 = readers.getTraceLogLines ?? (() => []);
  const getTaskLogEntries2 = readers.getTaskLogEntries ?? (() => []);
  return {
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    note: "Mirror of dev GET /api/logs ({ llm, trace, task }). Regenerated when the log ring changes.",
    llm: getLogEntries2(),
    trace: getTraceLogLines2(),
    task: getTaskLogEntries2()
  };
}
function scheduleAgentLogSnapshot() {
  if (!env.isDev || process.env.VITEST === "true") return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushAgentLogSnapshot();
  }, DEBOUNCE_MS);
}
function flushAgentLogSnapshotNow() {
  if (!env.isDev || process.env.VITEST === "true") return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  void flushAgentLogSnapshot();
}
async function flushAgentLogSnapshot() {
  try {
    const dir = path.join(process.cwd(), "logs");
    fs.mkdirSync(dir, { recursive: true });
    const payload = buildAgentLogSnapshotPayload();
    fs.writeFileSync(path.join(dir, "agent-snapshot.json"), `${JSON.stringify(payload, null, 2)}
`, "utf8");
  } catch (err) {
    if (env.isDev) console.warn("[agent-log-snapshot] write failed", err);
  }
}
const OBSERVABILITY_SCHEMA_VERSION = 1;
const sandbox = { "grepMaxLineLength": 500, "lsMaxEntries": 500, "findMaxResults": 1e3, "grepDefaultMatchLimit": 100, "bashToolMaxChars": 51200 };
const evaluator = { "fileMaxChars": 48e3, "bundleMaxChars": 64e3, "degradedMsgMax": 500, "revisionCompiledPromptMax": 4e3 };
const trace = { "toolArgsMaxChars": 2048, "toolResultMaxChars": 800, "labelMax": 4e3, "toolFieldMax": 4e3 };
const log = { "previewSnippetMax": 120, "commandPreviewMax": 160 };
const rawLimits = {
  sandbox,
  evaluator,
  trace,
  log
};
const ContentLimitsFileSchema = z.object({
  sandbox: z.object({
    grepMaxLineLength: z.number().int().min(1),
    lsMaxEntries: z.number().int().min(1),
    findMaxResults: z.number().int().min(1),
    grepDefaultMatchLimit: z.number().int().min(1),
    bashToolMaxChars: z.number().int().min(1)
  }).strict(),
  evaluator: z.object({
    fileMaxChars: z.number().int().min(1),
    bundleMaxChars: z.number().int().min(1),
    degradedMsgMax: z.number().int().min(1),
    revisionCompiledPromptMax: z.number().int().min(1)
  }).strict(),
  trace: z.object({
    toolArgsMaxChars: z.number().int().min(1),
    toolResultMaxChars: z.number().int().min(1),
    labelMax: z.number().int().min(1),
    toolFieldMax: z.number().int().min(1)
  }).strict(),
  log: z.object({
    previewSnippetMax: z.number().int().min(4),
    commandPreviewMax: z.number().int().min(4)
  }).strict()
}).strict();
const _limits = ContentLimitsFileSchema.parse(rawLimits);
_limits.sandbox.grepMaxLineLength;
_limits.sandbox.lsMaxEntries;
_limits.sandbox.findMaxResults;
_limits.sandbox.grepDefaultMatchLimit;
_limits.sandbox.bashToolMaxChars;
const EVAL_FILE_MAX_CHARS = _limits.evaluator.fileMaxChars;
const EVAL_BUNDLE_MAX_CHARS = _limits.evaluator.bundleMaxChars;
const EVAL_DEGRADED_MSG_MAX = _limits.evaluator.degradedMsgMax;
const REVISION_COMPILED_PROMPT_MAX = _limits.evaluator.revisionCompiledPromptMax;
const PI_TOOL_ARGS_TRACE_MAX_CHARS = _limits.trace.toolArgsMaxChars;
const PI_TOOL_RESULT_TRACE_MAX_CHARS = _limits.trace.toolResultMaxChars;
const TRACE_LABEL_MAX = _limits.trace.labelMax;
const TRACE_TOOL_FIELD_MAX = _limits.trace.toolFieldMax;
const LOG_PREVIEW_SNIPPET_MAX = _limits.log.previewSnippetMax;
const LOG_PREVIEW_SNIPPET_HEAD_CHARS = _limits.log.previewSnippetMax - 3;
const LOG_COMMAND_PREVIEW_MAX = _limits.log.commandPreviewMax;
const LOG_COMMAND_PREVIEW_HEAD_CHARS = _limits.log.commandPreviewMax - 3;
const DEFAULT_TRUNC_SUFFIX = "\n…[truncated]";
function truncateUtf16WithSuffix(s, maxChars, suffix = DEFAULT_TRUNC_SUFFIX) {
  if (maxChars <= 0 || s.length <= maxChars) return s;
  return s.slice(0, maxChars) + suffix;
}
function observabilityLineForFile(line) {
  if (line.type === "incubate_parsed") {
    const max2 = env.LLM_LOG_MAX_BODY_CHARS;
    if (max2 <= 0) return line;
    const p2 = { ...line.payload };
    if (typeof p2.firstHypothesisText === "string" && p2.firstHypothesisText.length > max2) {
      p2.firstHypothesisText = truncateUtf16WithSuffix(p2.firstHypothesisText, max2);
    }
    return { ...line, payload: p2 };
  }
  if (line.type === "task_result" || line.type === "task_run") {
    const max2 = env.LLM_LOG_MAX_BODY_CHARS;
    if (max2 <= 0) return line;
    const p2 = { ...line.payload };
    for (const key of ["resultContent", "userPrompt", "error"]) {
      const v = p2[key];
      if (typeof v === "string" && v.length > max2) {
        p2[key] = truncateUtf16WithSuffix(v, max2);
      }
    }
    return { ...line, payload: p2 };
  }
  if (line.type === "trace") {
    const ev = { ...line.payload.event };
    const lab = ev.label;
    if (typeof lab === "string" && lab.length > TRACE_LABEL_MAX) {
      ev.label = truncateUtf16WithSuffix(lab, TRACE_LABEL_MAX);
    }
    for (const key of ["detail", "toolArgs", "toolResult"]) {
      const v = ev[key];
      if (typeof v === "string" && v.length > TRACE_TOOL_FIELD_MAX) {
        ev[key] = truncateUtf16WithSuffix(v, TRACE_TOOL_FIELD_MAX);
      }
    }
    return {
      ...line,
      payload: { ...line.payload, event: ev }
    };
  }
  const max = env.LLM_LOG_MAX_BODY_CHARS;
  if (max <= 0) return line;
  const p = { ...line.payload };
  if (typeof p.systemPrompt === "string") p.systemPrompt = truncateUtf16WithSuffix(p.systemPrompt, max);
  if (typeof p.userPrompt === "string") p.userPrompt = truncateUtf16WithSuffix(p.userPrompt, max);
  if (typeof p.response === "string") p.response = truncateUtf16WithSuffix(p.response, max);
  return { ...line, payload: p };
}
function resolveFilePath() {
  if (process.env.VITEST === "true") return null;
  const dir = env.OBSERVABILITY_LOG_BASE_DIR;
  if (!dir) return null;
  if (env.LLM_LOG_FILE_MODE === "single") {
    return path.join(dir, "observability.ndjson");
  }
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return path.join(dir, `observability-${date}.ndjson`);
}
const ensuredDirs = /* @__PURE__ */ new Set();
function writeObservabilityLine(line) {
  const filePath = resolveFilePath();
  if (!filePath) return;
  const dir = path.dirname(filePath);
  try {
    if (!ensuredDirs.has(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      ensuredDirs.add(dir);
    }
    const out = observabilityLineForFile(line);
    fs.appendFileSync(filePath, `${JSON.stringify(out)}
`, "utf8");
  } catch (err) {
    console.error("[observability-sink] append failed", err);
  }
}
const traceLines = [];
const traceIdInRing = /* @__PURE__ */ new Set();
function trimTraceToCap() {
  const max = env.LLM_LOG_MAX_ENTRIES;
  while (traceLines.length > max) {
    const dropped = traceLines.shift();
    if (dropped?.payload.event.id) traceIdInRing.delete(String(dropped.payload.event.id));
  }
}
function appendTraceLines(lines) {
  for (const row of lines) {
    const id = row.event.id;
    if (typeof id !== "string" || !id) continue;
    if (traceIdInRing.has(id)) continue;
    traceIdInRing.add(id);
    const at = row.event.at;
    const ts = typeof at === "string" && at ? at : (/* @__PURE__ */ new Date()).toISOString();
    const line = {
      v: OBSERVABILITY_SCHEMA_VERSION,
      ts,
      type: "trace",
      payload: {
        event: row.event,
        correlationId: row.correlationId,
        resultId: row.resultId
      }
    };
    traceLines.push(line);
    writeObservabilityLine(line);
  }
  trimTraceToCap();
  scheduleAgentLogSnapshot();
}
function getTraceLogLines() {
  return traceLines.map((t) => ({
    ...t,
    payload: {
      ...t.payload,
      event: { ...t.payload.event }
    }
  }));
}
function clearTraceLogEntries() {
  traceLines.length = 0;
  traceIdInRing.clear();
}
configureAgentLogSnapshotReaders({
  getTraceLogLines
});
const entries = [];
const taskLogEntries = [];
function trimToMaxCap() {
  const max = env.LLM_LOG_MAX_ENTRIES;
  while (entries.length > max) entries.shift();
}
function trimTaskLogToCap() {
  const max = env.LLM_LOG_MAX_ENTRIES;
  while (taskLogEntries.length > max) taskLogEntries.shift();
}
function appendTaskResultLogEntry(input) {
  const row = {
    id: crypto.randomUUID(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "task_result",
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    resultFile: input.resultFile,
    resultContent: input.resultContent,
    sandboxFilePaths: input.sandboxFilePaths
  };
  taskLogEntries.push(row);
  trimTaskLogToCap();
  scheduleAgentLogSnapshot();
}
function appendTaskRunLogEntry(input) {
  const row = {
    id: crypto.randomUUID(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "task_run",
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    providerId: input.providerId,
    modelId: input.modelId,
    durationMs: input.durationMs,
    outcome: input.outcome,
    resultFile: input.resultFile,
    sandboxFileCount: input.sandboxFileCount,
    errorMessage: input.errorMessage,
    thinking: input.thinking
  };
  taskLogEntries.push(row);
  trimTaskLogToCap();
  scheduleAgentLogSnapshot();
}
function getTaskLogEntries() {
  return taskLogEntries.map((e) => ({ ...e }));
}
function clearTaskLogEntries() {
  taskLogEntries.length = 0;
}
function appendIncubateParsedLogEntry(input) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  const row = {
    id: crypto.randomUUID(),
    timestamp: ts,
    kind: "incubate_parsed",
    correlationId: input.correlationId,
    hypothesisCount: input.hypothesisCount,
    hypothesisNames: input.hypothesisNames,
    firstHypothesisText: input.firstHypothesisText,
    dimensionCount: input.dimensionCount
  };
  taskLogEntries.push(row);
  trimTaskLogToCap();
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts,
    type: "incubate_parsed",
    payload: {
      correlationId: input.correlationId,
      hypothesisCount: input.hypothesisCount,
      hypothesisNames: input.hypothesisNames,
      firstHypothesisText: input.firstHypothesisText,
      dimensionCount: input.dimensionCount
    }
  });
  scheduleAgentLogSnapshot();
}
function beginLlmCall(entry) {
  const id = crypto.randomUUID();
  entries.push({
    ...entry,
    id,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    response: entry.response ?? "",
    durationMs: 0,
    status: "in_progress"
  });
  trimToMaxCap();
  scheduleAgentLogSnapshot();
  return id;
}
function appendLlmCallResponse(id, chunk) {
  if (!chunk) return;
  const row = entries.find((e) => e.id === id);
  if (!row || row.status !== "in_progress") return;
  row.response += chunk;
}
function setLlmCallWaitingStatus(id, message) {
  const row = entries.find((e) => e.id === id);
  if (!row || row.status !== "in_progress") return;
  row.response = message;
}
function finalizeLlmCall(id, patch) {
  const i = entries.findIndex((e) => e.id === id);
  if (i === -1) return;
  const prev = entries[i];
  const nextStatus = patch.error ? "error" : "complete";
  const finalized = {
    ...prev,
    ...patch,
    id: prev.id,
    timestamp: prev.timestamp,
    status: nextStatus
  };
  entries[i] = finalized;
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts: finalized.timestamp,
    type: "llm",
    payload: { ...finalized }
  });
  scheduleAgentLogSnapshot();
}
function failLlmCall(id, error, durationMs) {
  finalizeLlmCall(id, {
    error,
    durationMs,
    response: entries.find((e) => e.id === id)?.response ?? ""
  });
}
function getLogEntries() {
  return entries.map((e) => ({ ...e }));
}
function getLlmLogResponseSnapshot(id) {
  return entries.find((e) => e.id === id)?.response;
}
function clearLogEntries() {
  entries.length = 0;
  clearTraceLogEntries();
  clearTaskLogEntries();
  flushAgentLogSnapshotNow();
}
configureAgentLogSnapshotReaders({
  getLogEntries,
  getTaskLogEntries
});
function normalizeError(err, fallback) {
  if (err instanceof Error) return err.message;
  return fallback ?? String(err);
}
const OPENROUTER_CREDIT_EXHAUSTED_MESSAGE = "OpenRouter credits are exhausted. This run cannot continue until the budget resets.";
function isOpenRouterCreditExhaustionLike(value) {
  const text = value instanceof Error ? value.message : typeof value === "string" ? value : value != null ? JSON.stringify(value) : "";
  const msg = text.toLowerCase();
  if (!msg) return false;
  return msg.includes("insufficient credits") || msg.includes("out of credits") || msg.includes("402") && (msg.includes("openrouter") || msg.includes("api key") || msg.includes("account")) || msg.includes("limit_remaining") && msg.includes("0");
}
function normalizeOpenRouterCreditError(value) {
  return isOpenRouterCreditExhaustionLike(value) ? OPENROUTER_CREDIT_EXHAUSTED_MESSAGE : void 0;
}
function normalizeProviderError(err, fallback) {
  return normalizeOpenRouterCreditError(err) ?? normalizeError(err, fallback);
}
function createWriteGate() {
  let tail = Promise.resolve();
  return {
    enqueue(fn) {
      const next = tail.then(fn);
      tail = next.catch((e) => {
        if (e != null) {
          console.error("[write-gate]", e);
        }
      });
      return next;
    }
  };
}
async function runTaskAgentSseBody(stream, handler) {
  let seq = 0;
  const allocId = () => String(seq++);
  const gate = createWriteGate();
  const sseWriteAudit = env.isDev ? { byType: {}, t0: Date.now() } : null;
  const write = async (event, data) => {
    if (sseWriteAudit) sseWriteAudit.byType[event] = (sseWriteAudit.byType[event] ?? 0) + 1;
    const payload = JSON.stringify(data);
    await gate.enqueue(async () => {
      await stream.writeSSE({ data: payload, event, id: allocId() });
    });
  };
  try {
    await handler({ write, allocId, gate });
    await write(SSE_EVENT_NAMES.phase, { phase: "complete" });
    await write(SSE_EVENT_NAMES.done, {});
  } catch (err) {
    await write(SSE_EVENT_NAMES.error, { error: normalizeProviderError(err) });
    await write(SSE_EVENT_NAMES.done, {});
  }
  if (sseWriteAudit) {
    console.debug("(task:SSE) write summary", {
      byType: sseWriteAudit.byType,
      durationMs: Date.now() - sseWriteAudit.t0
    });
  }
}
function agenticOrchestratorEventToSse(event) {
  switch (event.type) {
    case "phase":
      return { sseEvent: SSE_EVENT_NAMES.phase, data: { phase: event.phase } };
    case "evaluation_progress":
      return {
        sseEvent: SSE_EVENT_NAMES.evaluation_progress,
        data: {
          round: event.round,
          phase: event.phase,
          message: event.message
        }
      };
    case "evaluation_worker_done":
      return {
        sseEvent: SSE_EVENT_NAMES.evaluation_worker_done,
        data: { round: event.round, rubric: event.rubric, report: event.report }
      };
    case "evaluation_report":
      return {
        sseEvent: SSE_EVENT_NAMES.evaluation_report,
        data: { round: event.round, snapshot: event.snapshot }
      };
    case "revision_round":
      return {
        sseEvent: SSE_EVENT_NAMES.revision_round,
        data: { round: event.round, brief: event.brief }
      };
    case "streaming_tool":
      return {
        sseEvent: SSE_EVENT_NAMES.streaming_tool,
        data: {
          toolName: event.toolName,
          streamedChars: event.streamedChars,
          done: event.done,
          ...event.toolPath != null ? { toolPath: event.toolPath } : {}
        }
      };
    case "skills_loaded":
      return { sseEvent: SSE_EVENT_NAMES.skills_loaded, data: { skills: event.skills } };
    case "skill_activated":
      return {
        sseEvent: SSE_EVENT_NAMES.skill_activated,
        data: { key: event.key, name: event.name, description: event.description }
      };
    case "trace":
      return { sseEvent: SSE_EVENT_NAMES.trace, data: { trace: event.trace } };
    case "thinking":
      return {
        sseEvent: SSE_EVENT_NAMES.thinking,
        data: { delta: event.payload, turnId: event.turnId }
      };
    case "activity":
      return { sseEvent: SSE_EVENT_NAMES.activity, data: { entry: event.payload } };
    case "code":
      return { sseEvent: SSE_EVENT_NAMES.code, data: { code: event.payload } };
    case "error":
      return { sseEvent: SSE_EVENT_NAMES.error, data: { error: event.payload } };
    case "file":
      return { sseEvent: SSE_EVENT_NAMES.file, data: { path: event.path, content: event.content } };
    case "plan":
      return { sseEvent: SSE_EVENT_NAMES.plan, data: { files: event.files } };
    case "todos":
      return { sseEvent: SSE_EVENT_NAMES.todos, data: { todos: event.todos } };
    case "progress":
      return { sseEvent: SSE_EVENT_NAMES.progress, data: { status: event.payload } };
    default: {
      const _exhaustive = event;
      return _exhaustive;
    }
  }
}
function resolveTaskAgentResultFile(input) {
  const expectedContent = input.files[input.resultFile];
  if (expectedContent != null) {
    return { result: expectedContent, resultFile: input.resultFile };
  }
  if (input.fallback === "strict") return void 0;
  const firstFile = Object.entries(input.files).find(
    ([, content]) => content.trim().length > 0
  );
  if (!firstFile) return void 0;
  const [resultFile, result] = firstFile;
  return { result, resultFile };
}
async function writeTaskRunDiskLog(input) {
  const root = path.join(input.baseDir, "task-runs", input.correlationId);
  await mkdir(root, { recursive: true });
  const meta = {
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    providerId: input.providerId,
    modelId: input.modelId,
    durationMs: input.durationMs,
    outcome: input.outcome,
    resultFile: input.resultFile,
    sandboxFileCount: input.sandboxFilePaths.length,
    errorMessage: input.errorMessage
  };
  await writeFile(path.join(root, "meta.json"), `${JSON.stringify(meta, null, 2)}
`, "utf8");
  await writeFile(path.join(root, "user-prompt.txt"), input.userPrompt, "utf8");
  await writeFile(path.join(root, "result.json"), input.resultContent, "utf8");
  await writeFile(
    path.join(root, "skills.json"),
    `${JSON.stringify({ keys: input.skillKeys }, null, 2)}
`,
    "utf8"
  );
}
function emitTaskResultLine(input) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts,
    type: "task_result",
    payload: {
      sessionType: input.sessionType,
      correlationId: input.correlationId,
      resultFile: input.resultFile,
      resultContent: input.resultContent,
      sandboxFilePaths: Object.keys(input.files)
    }
  });
  appendTaskResultLogEntry({
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    resultFile: input.resultFile,
    resultContent: input.resultContent,
    sandboxFilePaths: Object.keys(input.files)
  });
  if (env.isDev) {
    console.debug("[task-agent] result extracted", {
      sessionType: input.sessionType,
      correlationId: input.correlationId,
      resultFile: input.resultFile,
      resultChars: input.resultContent.length,
      sandboxFileCount: Object.keys(input.files).length
    });
  }
}
function emitTaskRunLine(input) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts,
    type: "task_run",
    payload: {
      sessionType: input.sessionType,
      correlationId: input.correlationId,
      providerId: input.providerId,
      modelId: input.modelId,
      durationMs: input.durationMs,
      outcome: input.outcome,
      resultFile: input.resultFile,
      sandboxFileCount: input.sandboxFileCount,
      errorMessage: input.errorMessage,
      thinking: input.thinking
    }
  });
  appendTaskRunLogEntry({
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    providerId: input.providerId,
    modelId: input.modelId,
    durationMs: input.durationMs,
    outcome: input.outcome,
    resultFile: input.resultFile,
    sandboxFileCount: input.sandboxFileCount,
    errorMessage: input.errorMessage,
    thinking: input.thinking
  });
  if (env.isDev) {
    console.debug("[task-agent] task_run summary", {
      ...input,
      ts
    });
  }
}
function writeSuccessfulTaskRunDiskLog(input) {
  if (!input.baseDir) return;
  void writeTaskRunDiskLog({
    baseDir: input.baseDir,
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    providerId: input.providerId,
    modelId: input.modelId,
    userPrompt: input.userPrompt,
    resultFile: input.resultFile,
    resultContent: input.resultContent,
    sandboxFilePaths: input.sandboxFilePaths,
    skillKeys: input.skillKeys,
    durationMs: input.durationMs,
    outcome: "success"
  }).catch((err) => {
    if (env.isDev) console.error("[task-agent] writeTaskRunDiskLog failed", err);
  });
}
let activeSlots = 0;
let gateChain = Promise.resolve();
async function acquireAgenticSlotOrReject() {
  return new Promise((resolve2) => {
    gateChain = gateChain.then(() => {
      const max = env.MAX_CONCURRENT_AGENTIC_RUNS;
      if (activeSlots >= max) {
        resolve2(false);
        return;
      }
      activeSlots += 1;
      resolve2(true);
    });
  });
}
function releaseAgenticSlot() {
  gateChain = gateChain.then(() => {
    activeSlots = Math.max(0, activeSlots - 1);
  });
}
async function acquireTaskAgentSlot() {
  return acquireAgenticSlotOrReject();
}
function releaseTaskAgentSlot() {
  releaseAgenticSlot();
}
function makeRunTraceEvent(fields) {
  return {
    ...fields,
    id: fields.id ?? crypto.randomUUID(),
    at: fields.at ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function emitSkillsLoadedEvents(emit, skills, tracePhase) {
  const label = skills.length === 0 ? "No agent skills in catalog for this session" : `Skills catalog (${skills.length}): ${skills.map((s) => s.name).join(", ")}`;
  await emit({
    type: "trace",
    trace: makeRunTraceEvent({
      kind: "skills_loaded",
      label,
      phase: tracePhase,
      status: skills.length === 0 ? "info" : "success"
    })
  });
  await emit({ type: "skills_loaded", skills });
}
function splitFrontmatterMarkdown(raw) {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const frontmatterYaml = lines.slice(1, end).join("\n");
  const body = lines.slice(end + 1).join("\n").replace(/^\n+/, "");
  return { frontmatterYaml, body };
}
const skillWhenSchema = z.enum(["auto", "always", "manual"]);
const skillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).max(1024),
  "allowed-tools": z.union([z.string(), z.array(z.string())]).optional(),
  dependencies: z.union([z.string(), z.array(z.string())]).optional(),
  tags: z.array(z.string()).optional().default([]),
  when: skillWhenSchema.optional().default("auto")
});
const SKILL_FILENAME = "SKILL.md";
const SESSION_TAGS = {
  design: ["design"],
  incubation: ["incubation"],
  evaluation: ["evaluation"],
  "inputs-gen": ["inputs-gen"],
  "design-system": ["design-system"]
};
function resolvePackageSkillsCatalogRoot() {
  return path.resolve(process.cwd(), "packages", "auto-designer-pi", "skills");
}
async function safeReadSkillDir(skillsRoot, name) {
  if (name.startsWith("_") || name.startsWith(".")) return null;
  const dir = path.join(skillsRoot, name);
  const skillPath = path.join(dir, SKILL_FILENAME);
  let raw;
  try {
    raw = await fs$1.readFile(skillPath, "utf8");
  } catch {
    return null;
  }
  const split = splitFrontmatterMarkdown(raw);
  if (!split) return null;
  let data;
  try {
    data = parse(split.frontmatterYaml);
  } catch (err) {
    if (env.isDev) {
      console.warn(`[skill-discovery] Invalid YAML in ${skillPath}`, err);
    }
    return null;
  }
  const parsed = skillFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    if (env.isDev) {
      console.warn(
        `[skill-discovery] Invalid skill frontmatter in ${skillPath}`,
        parsed.error.flatten()
      );
    }
    return null;
  }
  return {
    ...parsed.data,
    key: name,
    dir,
    bodyMarkdown: split.body,
    resources: []
  };
}
function filterSkillsForSession(entries2, sessionType) {
  const allowedTags = SESSION_TAGS[sessionType];
  return entries2.filter((e) => {
    if (e.when === "manual") return false;
    return e.tags.some((t) => allowedTags.includes(t));
  });
}
async function discoverSkills(skillsRoot) {
  let names;
  try {
    names = await fs$1.readdir(skillsRoot);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const ent = await safeReadSkillDir(skillsRoot, name);
    if (ent) out.push(ent);
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
function catalogEntriesToSummaries(entries2) {
  return entries2.map((s) => ({
    key: s.key,
    name: s.name,
    description: s.description
  }));
}
async function buildAgenticSystemContext(input) {
  const systemPrompt = loadDesignerSystemPrompt();
  const sandboxSeedFiles = {};
  const sessionType = input.sessionType ?? "design";
  const skillsRoot = input.skillsRoot ?? resolvePackageSkillsCatalogRoot();
  const allEntries = await discoverSkills(skillsRoot);
  const catalogEntries = filterSkillsForSession(allEntries, sessionType);
  const loadedSkills = catalogEntriesToSummaries(catalogEntries);
  if (env.isDev) {
    console.debug("[agentic-context] skills", {
      sessionType,
      discovered: allEntries.length,
      filtered: catalogEntries.length,
      keys: catalogEntries.map((e) => e.key),
      seedFileCount: Object.keys(sandboxSeedFiles).length,
      systemPromptChars: systemPrompt.length
    });
  }
  return { systemPrompt, sandboxSeedFiles, loadedSkills, skillCatalog: catalogEntries };
}
const minCompletion = 256;
const absoluteCeiling = 2097152;
const margins = { "incubate": 1536, "compaction": 2048, "agentTurn": 6144, "default": 4096 };
const rawBudget = {
  minCompletion,
  absoluteCeiling,
  margins
};
const CHARS_PER_TOKEN = 3.6;
const MESSAGE_OVERHEAD = 6;
function estimateTextTokens(text) {
  if (!text) return MESSAGE_OVERHEAD;
  return Math.ceil(text.length / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD;
}
function estimatePartsTokens(parts) {
  let n = MESSAGE_OVERHEAD;
  for (const p of parts) {
    if (p.type === "text") n += Math.ceil(p.text.length / CHARS_PER_TOKEN);
    else if (p.type === "image_url") n += 2500;
  }
  return n;
}
function estimateMessageContentTokens(content) {
  if (typeof content === "string") return estimateTextTokens(content);
  return estimatePartsTokens(content);
}
function estimateChatMessagesTokens(messages) {
  let sum = 0;
  for (const m of messages) {
    sum += estimateMessageContentTokens(m.content);
  }
  return Math.ceil(sum * 1.04);
}
const ChatCompletionSuccessSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.union([
        z.string(),
        z.array(z.record(z.string(), z.unknown()))
      ])
    }).passthrough(),
    finish_reason: z.unknown().optional()
  }).passthrough()).min(1),
  usage: z.record(z.string(), z.unknown()).optional()
}).passthrough();
const ModelListSuccessSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())).optional().default([])
}).passthrough();
function extractMessageText(data) {
  const choices = data.choices;
  const message = choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const p = item;
      const typ = p.type;
      if (typ === "text" && typeof p.text === "string") {
        parts.push(p.text);
        continue;
      }
      if (typ === "reasoning") {
        if (typeof p.text === "string") parts.push(p.text);
        else if (typeof p.summary === "string") parts.push(p.summary);
      }
    }
    return parts.join("");
  }
  return "";
}
async function fetchChatCompletion(url, body, errorMap, providerLabel, extraHeaders, signal) {
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders
  };
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) {
    const errorBody = await response.text();
    const creditMessage = normalizeOpenRouterCreditError(errorBody || `${providerLabel} ${response.status}`);
    if (creditMessage) throw new Error(creditMessage);
    const mapped = errorMap[response.status];
    if (mapped) throw new Error(mapped);
    throw new Error(`${providerLabel} API error (${response.status}): ${errorBody}`);
  }
  const data = await response.json();
  const parsed = ChatCompletionSuccessSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`${providerLabel} API returned an invalid chat completion response`);
  }
  return parsed.data;
}
async function fetchModelList(url, mapFn, extraHeaders) {
  try {
    const response = await fetch(url, extraHeaders ? { headers: extraHeaders } : void 0);
    if (!response.ok) return [];
    const json = await response.json();
    const parsed = ModelListSuccessSchema.safeParse(json);
    if (!parsed.success) return [];
    return mapFn(parsed.data.data);
  } catch {
    return [];
  }
}
function num$1(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : void 0;
}
function parseChatResponse(data) {
  const choices = data.choices;
  const firstChoice = choices?.[0];
  const finishReason = firstChoice?.finish_reason;
  const rawText = extractMessageText(data);
  const usage = data.usage;
  const promptTok = num$1(usage?.prompt_tokens);
  const completionTok = num$1(usage?.completion_tokens);
  const totalTok = num$1(usage?.total_tokens);
  const promptDetails = usage?.prompt_tokens_details;
  const completionDetails = usage?.completion_tokens_details;
  const reasoningTok = num$1(completionDetails?.reasoning_tokens);
  const cachedTok = num$1(promptDetails?.cached_tokens);
  const cost = num$1(usage?.cost);
  const truncated = finishReason === "length";
  const hasUsageNumbers = promptTok !== void 0 || completionTok !== void 0 || totalTok !== void 0 || reasoningTok !== void 0 || cachedTok !== void 0 || cost !== void 0;
  if (!hasUsageNumbers && !truncated) {
    return { raw: rawText };
  }
  const metadata = { truncated };
  if (completionTok !== void 0) {
    metadata.completionTokens = completionTok;
    metadata.tokensUsed = completionTok;
  }
  if (promptTok !== void 0) metadata.promptTokens = promptTok;
  if (totalTok !== void 0) metadata.totalTokens = totalTok;
  if (reasoningTok !== void 0) metadata.reasoningTokens = reasoningTok;
  if (cachedTok !== void 0) metadata.cachedPromptTokens = cachedTok;
  if (cost !== void 0) metadata.costCredits = cost;
  return {
    raw: rawText,
    metadata
  };
}
const __vite_import_meta_env__ = {};
function viteMaxOutputTokensFromEnv() {
  return __vite_import_meta_env__?.VITE_MAX_OUTPUT_TOKENS;
}
function buildChatRequestFromMessages$1(model, messages, extraFields, maxTokens) {
  const envMax = viteMaxOutputTokensFromEnv();
  const resolved = maxTokens ?? (envMax ? parseInt(envMax, 10) : void 0);
  const body = {
    model,
    messages,
    temperature: 0.7,
    ...extraFields
  };
  if (resolved) {
    body.max_tokens = resolved;
  }
  return body;
}
function buildChatRequestFromMessages(model, messages, extraFields, maxTokens) {
  return buildChatRequestFromMessages$1(model, messages, extraFields, maxTokens);
}
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : void 0;
}
function appendDeltaContent(delta, out) {
  const c = delta.content;
  if (typeof c === "string" && c.length > 0) {
    out.acc += c;
    return;
  }
  if (Array.isArray(c)) {
    for (const item of c) {
      if (!item || typeof item !== "object") continue;
      const p = item;
      const typ = p.type;
      if (typ === "text" && typeof p.text === "string") {
        out.acc += p.text;
      } else if (typ === "reasoning") {
        if (typeof p.text === "string") out.acc += p.text;
        else if (typeof p.summary === "string") out.acc += p.summary;
      }
    }
    return;
  }
  const reasoning = delta.reasoning;
  if (typeof reasoning === "string" && reasoning.length > 0) {
    out.acc += reasoning;
  }
}
function usageFromChunk(chunk) {
  const usage = chunk.usage;
  if (!usage) return void 0;
  const o = {};
  const pt = num(usage.prompt_tokens);
  const ct = num(usage.completion_tokens);
  const tt = num(usage.total_tokens);
  if (pt !== void 0) o.promptTokens = pt;
  if (ct !== void 0) {
    o.completionTokens = ct;
    o.tokensUsed = ct;
  }
  if (tt !== void 0) o.totalTokens = tt;
  const pd = usage.prompt_tokens_details;
  const cd = usage.completion_tokens_details;
  const rt = num(cd?.reasoning_tokens);
  const cached = num(pd?.cached_tokens);
  if (rt !== void 0) o.reasoningTokens = rt;
  if (cached !== void 0) o.cachedPromptTokens = cached;
  const cost = num(usage.cost);
  if (cost !== void 0) o.costCredits = cost;
  return Object.keys(o).length > 0 ? o : void 0;
}
async function streamOpenAICompatibleChat(url, body, options, onTextDelta) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...options.headers ?? {}
    },
    body: JSON.stringify(body),
    signal: options.signal
  });
  if (!response.ok) {
    const errText = await response.text();
    const creditMessage = normalizeOpenRouterCreditError(errText || `${options.providerLabel} ${response.status}`);
    if (creditMessage) throw new Error(creditMessage);
    const mapped = options.errorMap[response.status];
    if (mapped) throw new Error(mapped);
    throw new Error(`${options.providerLabel} API error (${response.status}): ${errText}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${options.providerLabel}: empty response body`);
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  let lastMeta;
  let finishReason;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.replace(/\r$/, "").trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      const err = chunk.error;
      if (err != null) {
        const creditMessage = normalizeOpenRouterCreditError(err);
        if (creditMessage) throw new Error(creditMessage);
        const msg = typeof err === "object" && typeof err.message === "string" ? err.message : normalizeError(err, "stream error");
        throw new Error(`${options.providerLabel}: ${msg}`);
      }
      const usage = usageFromChunk(chunk);
      if (usage) lastMeta = { ...lastMeta, ...usage };
      const choices = chunk.choices;
      const choice0 = choices?.[0];
      if (choice0 && typeof choice0.finish_reason === "string") {
        finishReason = choice0.finish_reason;
      }
      const delta = choice0?.delta;
      if (delta && typeof delta === "object") {
        const before = assembled;
        const bag = { acc: "" };
        appendDeltaContent(delta, bag);
        if (bag.acc.length > 0) {
          assembled += bag.acc;
          if (assembled !== before) {
            await onTextDelta(assembled);
          }
        }
      }
    }
  }
  const truncated = finishReason === "length";
  const meta = lastMeta ? { ...lastMeta, truncated: truncated || lastMeta.truncated } : truncated ? { truncated } : void 0;
  return {
    raw: assembled,
    metadata: meta
  };
}
function levelToEffort(level) {
  switch (level) {
    case "off":
      return null;
    case "minimal":
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
    case "xhigh":
      return "high";
  }
}
function openRouterThinkingFields(thinking) {
  if (!thinking || thinking.level === "off") return {};
  const effort = levelToEffort(thinking.level);
  if (!effort) return {};
  return {
    reasoning: {
      effort,
      max_tokens: thinking.budgetTokens
    }
  };
}
function lmStudioThinkingFields(thinking) {
  if (!thinking || thinking.level === "off") return {};
  const effort = levelToEffort(thinking.level);
  if (!effort) return {};
  return { reasoning_effort: effort };
}
const modelProviderRouting = {};
const rawRoutingConfig = {
  modelProviderRouting
};
const OpenRouterRoutingConfigSchema = z.object({
  modelProviderRouting: z.record(
    z.string().min(1),
    z.object({
      order: z.array(z.string().min(1)).min(1),
      allow_fallbacks: z.boolean()
    }).strict()
  )
}).strict();
const OPENROUTER_ROUTING_CONFIG = OpenRouterRoutingConfigSchema.parse(rawRoutingConfig);
function openRouterProviderRoutingForModel(modelId) {
  const routing = OPENROUTER_ROUTING_CONFIG.modelProviderRouting[modelId];
  if (!routing) return {};
  return {
    provider: {
      order: [...routing.order],
      allow_fallbacks: routing.allow_fallbacks
    }
  };
}
function authHeaders() {
  return {
    "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`
  };
}
class OpenRouterGenerationProvider {
  id = "openrouter";
  name = "OpenRouter";
  description = "Generates HTML code via OpenRouter (Claude, GPT-4o, Gemini, etc.)";
  supportsImages = false;
  supportsParallel = true;
  async listModels() {
    return fetchModelList(
      `${env.OPENROUTER_BASE_URL}/api/v1/models`,
      (models2) => models2.map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        contextLength: m.context_length,
        supportsVision: typeof m.modality === "string" && m.modality.includes("image"),
        supportsReasoning: supportsReasoningModel(m.id)
      })),
      authHeaders()
    );
  }
  async generateChat(messages, options) {
    const model = options.model || "anthropic/claude-sonnet-4.5";
    const purpose = options.completionPurpose ?? "default";
    const maxTok = await completionMaxTokensForChat("openrouter", model, messages, purpose);
    const thinkingExtras = openRouterThinkingFields(options.thinking);
    const requestBody = buildChatRequestFromMessages(
      model,
      messages,
      { ...thinkingExtras, ...openRouterProviderRoutingForModel(model) },
      maxTok
    );
    const data = await fetchChatCompletion(
      `${env.OPENROUTER_BASE_URL}/api/v1/chat/completions`,
      requestBody,
      {
        401: "Invalid OpenRouter API key.",
        402: "OpenRouter credits are exhausted. This run cannot continue until the budget resets.",
        429: "Rate limit exceeded. Wait a moment and try again."
      },
      "OpenRouter",
      authHeaders(),
      options.signal
    );
    return parseChatResponse(data);
  }
  async generateChatStream(messages, options, onDelta) {
    const model = options.model || "anthropic/claude-sonnet-4.5";
    const purpose = options.completionPurpose ?? "default";
    const maxTok = await completionMaxTokensForChat("openrouter", model, messages, purpose);
    const thinkingExtras = openRouterThinkingFields(options.thinking);
    const requestBody = buildChatRequestFromMessages(
      model,
      messages,
      { stream: true, ...thinkingExtras, ...openRouterProviderRoutingForModel(model) },
      maxTok
    );
    return streamOpenAICompatibleChat(
      `${env.OPENROUTER_BASE_URL}/api/v1/chat/completions`,
      requestBody,
      {
        headers: authHeaders(),
        signal: options.signal,
        errorMap: {
          401: "Invalid OpenRouter API key.",
          402: "OpenRouter credits are exhausted. This run cannot continue until the budget resets.",
          429: "Rate limit exceeded. Wait a moment and try again."
        },
        providerLabel: "OpenRouter"
      },
      onDelta
    );
  }
  isAvailable() {
    return !!env.OPENROUTER_API_KEY;
  }
}
const CACHE_TTL_MS = 6e4;
let openRouterCache = null;
async function getOpenRouterContextMap() {
  const now2 = Date.now();
  if (openRouterCache && now2 - openRouterCache.at < CACHE_TTL_MS) {
    return openRouterCache.contextById;
  }
  const provider = new OpenRouterGenerationProvider();
  const models2 = await provider.listModels();
  const contextById = /* @__PURE__ */ new Map();
  for (const m of models2) {
    if (m.contextLength != null && m.contextLength > 0) {
      contextById.set(m.id, m.contextLength);
    }
  }
  openRouterCache = { at: now2, contextById };
  return contextById;
}
async function getProviderModelContextWindow(providerId, modelId) {
  if (providerId !== "openrouter") return void 0;
  const map = await getOpenRouterContextMap();
  return map.get(modelId);
}
const CompletionBudgetFileSchema = z.object({
  minCompletion: z.number().int().min(1),
  absoluteCeiling: z.number().int().min(1),
  margins: z.object({
    incubate: z.number().int().min(0),
    compaction: z.number().int().min(0),
    agentTurn: z.number().int().min(0),
    default: z.number().int().min(0)
  }).strict()
}).strict();
const _budget = CompletionBudgetFileSchema.parse(rawBudget);
const MIN_COMPLETION = _budget.minCompletion;
const ABSOLUTE_CEILING = _budget.absoluteCeiling;
const MARGIN = {
  incubate: _budget.margins.incubate,
  compaction: _budget.margins.compaction,
  agent_turn: _budget.margins.agentTurn,
  default: _budget.margins.default
};
const FALLBACK_OPENROUTER_CONTEXT_WINDOW = 131072;
function contextFallback(providerId) {
  return providerId === "lmstudio" ? env.LM_STUDIO_CONTEXT_WINDOW : FALLBACK_OPENROUTER_CONTEXT_WINDOW;
}
function completionBudgetFromPromptTokens(contextWindow, estimatedPromptTokens, purpose, productCap) {
  const cw = Math.max(4096, contextWindow);
  const margin = MARGIN[purpose];
  const prompt = Math.max(0, estimatedPromptTokens);
  const raw = cw - prompt - margin;
  if (raw < MIN_COMPLETION) return void 0;
  let b = Math.min(raw, ABSOLUTE_CEILING);
  if (productCap != null) b = Math.min(b, productCap);
  return Math.max(MIN_COMPLETION, b);
}
async function completionMaxTokensForChat(providerId, modelId, messages, purpose) {
  const registry = await getProviderModelContextWindow(providerId, modelId) ?? contextFallback(providerId);
  const est = estimateChatMessagesTokens(messages);
  return completionBudgetFromPromptTokens(
    registry,
    est,
    purpose,
    env.MAX_OUTPUT_TOKENS
  );
}
const toolArgsRecordSchema = z.record(z.string(), z.unknown());
const TOOL_PATH_ARG_KEYS = ["path", "file", "filePath", "target_file"];
function extractPiToolPathFromArguments(raw) {
  const parsed = toolArgsRecordSchema.safeParse(raw);
  if (!parsed.success) return void 0;
  const o = parsed.data;
  for (const key of TOOL_PATH_ARG_KEYS) {
    const v = o[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return void 0;
}
function parsePiToolExecutionArgs(_toolName, raw) {
  const parsed = toolArgsRecordSchema.safeParse(raw);
  if (!parsed.success) {
    return {};
  }
  const o = parsed.data;
  const path2 = typeof o.path === "string" ? o.path : void 0;
  const pattern = typeof o.pattern === "string" ? o.pattern : void 0;
  const key = typeof o.key === "string" ? o.key : void 0;
  const name = typeof o.name === "string" ? o.name : void 0;
  return { path: path2 ?? key ?? name, pattern };
}
function isTextPart(p) {
  return p !== null && typeof p === "object" && p.type === "text" && typeof p.text === "string";
}
function isThinkingPart(p) {
  return p !== null && typeof p === "object" && p.type === "thinking" && typeof p.thinking === "string";
}
function isImagePart(p) {
  return p !== null && typeof p === "object" && p.type === "image" && typeof p.data === "string";
}
function isToolCallPart(p) {
  if (p === null || typeof p !== "object") return false;
  if (p.type !== "toolCall") return false;
  return typeof p.name === "string";
}
function parseToolCallFromAssistantSlice(slice) {
  if (slice === null || typeof slice !== "object" || !("type" in slice)) {
    return { toolName: "tool" };
  }
  const type = slice.type;
  if (type !== "toolCall") {
    return { toolName: "tool" };
  }
  const obj = slice;
  const name = obj.name;
  const args = obj.arguments;
  const toolName = typeof name === "string" && name.length > 0 ? name : "tool";
  const argumentsObj = args !== null && typeof args === "object" && !Array.isArray(args) ? args : void 0;
  const toolPath = argumentsObj != null ? extractPiToolPathFromArguments(argumentsObj) : void 0;
  return { toolName, ...toolPath != null ? { toolPath } : {} };
}
function toolMetaFromPartialNarrowed(partial, contentIndex) {
  const slice = partial.content[contentIndex];
  return parseToolCallFromAssistantSlice(slice);
}
function extractToolPathFromAssistantPartial(partial, contentIndex) {
  return toolMetaFromPartialNarrowed(partial, contentIndex).toolPath;
}
function parsePiToolCallEnd(toolCall) {
  if (toolCall === null || typeof toolCall !== "object" || Array.isArray(toolCall)) {
    return null;
  }
  const o = toolCall;
  const name = o.name;
  const args = o.arguments;
  const out = {};
  if (typeof name === "string") out.name = name;
  if (args !== null && typeof args === "object" && !Array.isArray(args)) {
    out.arguments = args;
  }
  return out;
}
function toolPathFromNarrowedToolCall(tc) {
  return extractPiToolPathFromArguments(tc.arguments);
}
function parseUnknownArgsRecord(args) {
  if (args === null || args === void 0) return void 0;
  if (typeof args !== "object" || Array.isArray(args)) return void 0;
  return args;
}
function parseCompactionDetails(details) {
  if (details === null || typeof details !== "object" || Array.isArray(details)) return void 0;
  const d = details;
  const readFiles = d.readFiles;
  const modifiedFiles = d.modifiedFiles;
  const out = {};
  if (Array.isArray(readFiles) && readFiles.every((x) => typeof x === "string")) {
    out.readFiles = readFiles;
  }
  if (Array.isArray(modifiedFiles) && modifiedFiles.every((x) => typeof x === "string")) {
    out.modifiedFiles = modifiedFiles;
  }
  return Object.keys(out).length > 0 ? out : void 0;
}
const IMAGE_TOKEN_ESTIMATE = 2500;
const CONTEXT_TOKEN_FUDGE = 1.04;
const MIN_USER_MESSAGE_TOKENS = 6;
function estimateUserOrToolContent(content) {
  if (typeof content === "string") return estimateTextTokens(content);
  let n = 0;
  for (const part of content) {
    if (isTextPart(part)) n += estimateTextTokens(part.text);
    else if (isImagePart(part)) n += IMAGE_TOKEN_ESTIMATE;
  }
  return Math.max(n, MIN_USER_MESSAGE_TOKENS);
}
function estimatePiContextTokens(context) {
  let n = estimateTextTokens(context.systemPrompt ?? "");
  for (const m of context.messages) {
    if (m.role === "user" || m.role === "toolResult") {
      n += estimateUserOrToolContent(m.content);
    } else if (m.role === "assistant") {
      for (const c of m.content) {
        if (isTextPart(c)) n += estimateTextTokens(c.text);
        else if (isThinkingPart(c)) n += estimateTextTokens(c.thinking);
        else if (isToolCallPart(c)) {
          n += estimateTextTokens(JSON.stringify(c.arguments ?? {}));
          n += estimateTextTokens(c.name);
        }
      }
    }
  }
  if (context.tools?.length) {
    for (const t of context.tools) {
      n += estimateTextTokens(`${t.name}
${t.description}
${JSON.stringify(t.parameters ?? {})}`);
    }
  }
  return Math.ceil(n * CONTEXT_TOKEN_FUDGE);
}
function piStreamCompletionMaxTokens(model, context, explicitFromOptions) {
  if (explicitFromOptions != null) return explicitFromOptions;
  const est = estimatePiContextTokens(context);
  const product = env.MAX_OUTPUT_TOKENS;
  const dynamic = completionBudgetFromPromptTokens(
    model.contextWindow,
    est,
    "agent_turn",
    product ?? void 0
  );
  const ceil = Math.min(model.maxTokens, product ?? model.maxTokens);
  if (dynamic == null) return ceil;
  return Math.min(dynamic, ceil);
}
const DEFAULT_MODEL = "qwen/qwen3-coder-next";
class LMStudioProvider {
  id = "lmstudio";
  name = "LM Studio (Local)";
  description = "Local inference via LM Studio API";
  supportsImages = false;
  supportsParallel = false;
  async listModels() {
    return fetchModelList(
      `${env.LMSTUDIO_URL}/v1/models`,
      (models2) => models2.map((m) => {
        const id = m.id;
        return { id, name: id, supportsReasoning: supportsReasoningModel(id) };
      })
    );
  }
  async generateChat(messages, options) {
    const model = options.model || DEFAULT_MODEL;
    const purpose = options.completionPurpose ?? "default";
    const maxTok = await completionMaxTokensForChat("lmstudio", model, messages, purpose);
    const thinkingExtras = lmStudioThinkingFields(options.thinking);
    const requestBody = buildChatRequestFromMessages(
      model,
      messages,
      { stream: false, ...thinkingExtras },
      maxTok
    );
    const data = await fetchChatCompletion(
      `${env.LMSTUDIO_URL}/v1/chat/completions`,
      requestBody,
      { 404: "LM Studio not available. Make sure LM Studio is running and the server is enabled." },
      "LM Studio",
      void 0,
      options.signal
    );
    return parseChatResponse(data);
  }
  async generateChatStream(messages, options, onDelta) {
    const model = options.model || DEFAULT_MODEL;
    const purpose = options.completionPurpose ?? "default";
    const maxTok = await completionMaxTokensForChat("lmstudio", model, messages, purpose);
    const thinkingExtras = lmStudioThinkingFields(options.thinking);
    const requestBody = buildChatRequestFromMessages(
      model,
      messages,
      { stream: true, ...thinkingExtras },
      maxTok
    );
    return streamOpenAICompatibleChat(
      `${env.LMSTUDIO_URL}/v1/chat/completions`,
      requestBody,
      {
        signal: options.signal,
        errorMap: {
          404: "LM Studio not available. Make sure LM Studio is running and the server is enabled."
        },
        providerLabel: "LM Studio"
      },
      onDelta
    );
  }
  isAvailable() {
    return true;
  }
}
const providers = /* @__PURE__ */ new Map();
function registerProvider(provider) {
  providers.set(provider.id, provider);
}
function getProvider(id) {
  return providers.get(id);
}
function getAvailableProviders() {
  return Array.from(providers.values()).filter((p) => p.isAvailable());
}
registerProvider(new OpenRouterGenerationProvider());
registerProvider(new LMStudioProvider());
function providerLogFields(providerId) {
  const name = getProvider(providerId)?.name;
  return name && name !== providerId ? { provider: providerId, providerName: name } : { provider: providerId };
}
function stripProviderControlTokens(text) {
  if (!text) return text;
  return text.replace(/<ctrl\d+>/gi, "");
}
function mergeStreamedAndFormattedAssistantResponse(streamed, formatted) {
  const s = streamed.length;
  const f = formatted.length;
  if (s > f) return streamed;
  return formatted;
}
const PI_LLM_LOG_PHASE = {
  AGENTIC_TURN: "agentic_turn",
  REVISION: "revision"
};
function mapSessionTypeToLlmLogSource(sessionType) {
  switch (sessionType) {
    case "incubation":
      return "incubator";
    case "inputs-gen":
      return "inputsGen";
    case "design-system":
      return "designSystem";
    case "evaluation":
    case "design":
    default:
      return "builder";
  }
}
function userOrToolContentToString(content) {
  if (typeof content === "string") return content;
  return content.map((p) => p.type === "text" ? p.text : "[image]").join("");
}
function piContextToLogFields(context) {
  const systemPrompt = context.systemPrompt?.trim() || "(no system message)";
  const formatOne = (m) => {
    if (m.role === "user") {
      return userOrToolContentToString(m.content);
    }
    if (m.role === "toolResult") {
      const body = userOrToolContentToString(m.content);
      return `[tool_result ${m.toolName}]
${body}`;
    }
    if (m.role === "assistant") {
      return formatAssistantForLog(m);
    }
    return "";
  };
  const chunks = context.messages.map(formatOne).filter(Boolean);
  return {
    systemPrompt,
    userPrompt: chunks.join("\n\n") || "(no user message)"
  };
}
function formatAssistantForLog(m) {
  const parts = [];
  for (const c of m.content) {
    if (c.type === "text") parts.push(stripProviderControlTokens(c.text));
    else if (c.type === "thinking")
      parts.push(`[thinking]
${stripProviderControlTokens(c.thinking)}`);
    else if (c.type === "toolCall") {
      const path2 = typeof c.arguments?.path === "string" ? c.arguments.path : void 0;
      const cmd = typeof c.arguments?.command === "string" ? c.arguments.command : void 0;
      if (c.name === "bash" && cmd) {
        const short = cmd.length > 200 ? `${cmd.slice(0, 197)}…` : cmd;
        parts.push(`[tool_call ${c.name} command=${JSON.stringify(short)}]`);
      } else {
        parts.push(
          path2 ? `[tool_call ${c.name} path=${path2}]` : `[tool_call ${c.name} ${JSON.stringify(c.arguments)}]`
        );
      }
    }
  }
  return parts.join("\n");
}
function toolCallsForLog(m) {
  const out = [];
  for (const c of m.content) {
    if (c.type !== "toolCall") continue;
    const path2 = typeof c.arguments?.path === "string" ? c.arguments.path : void 0;
    out.push({ name: c.name, path: path2 });
  }
  return out;
}
function wrapPiStreamWithLogging(inner, params) {
  return ((model, context, options) => {
    const streamMax = piStreamCompletionMaxTokens(model, context, options?.maxTokens);
    if (process.env.NODE_ENV !== "production") {
      console.debug("[pi-llm-log] streamFn invoked", {
        provider: params.providerId,
        model: params.modelId || model.id,
        source: params.source,
        phase: params.phase,
        correlationId: params.correlationId,
        turnMessages: context.messages.length
      });
    }
    return Promise.resolve(
      inner(model, context, { ...options, maxTokens: streamMax })
    ).then((stream) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[pi-llm-log] streamFn resolved (stream object received)", {
          provider: params.providerId,
          model: params.modelId || model.id,
          source: params.source,
          phase: params.phase,
          correlationId: params.correlationId
        });
      }
      const t0 = performance.now();
      const pv = providerLogFields(params.providerId);
      const modelLabel = params.modelId || model.id;
      const { systemPrompt, userPrompt } = piContextToLogFields(context);
      const logId = beginLlmCall({
        source: params.source,
        phase: params.phase,
        model: modelLabel,
        ...pv,
        systemPrompt,
        userPrompt,
        response: "",
        ...params.correlationId ? { correlationId: params.correlationId } : {}
      });
      params.turnLogRef.current = logId;
      const finalizePromise = finalizeLogFromStream(stream, {
        logId,
        t0,
        params
      });
      if (params.pendingLogFinalizers) {
        params.pendingLogFinalizers.add(finalizePromise);
        void finalizePromise.finally(() => {
          params.pendingLogFinalizers?.delete(finalizePromise);
        });
      }
      return stream;
    });
  });
}
async function finalizeLogFromStream(stream, args) {
  const { logId, t0, params } = args;
  try {
    const final = await stream.result();
    const formatted = formatAssistantForLog(final);
    const streamed = getLlmLogResponseSnapshot(logId) ?? "";
    const response = mergeStreamedAndFormattedAssistantResponse(streamed, formatted);
    const toolCalls = toolCallsForLog(final);
    const durationMs = Math.round(performance.now() - t0);
    finalizeLlmCall(logId, {
      response,
      durationMs,
      promptTokens: final.usage?.input,
      completionTokens: final.usage?.output,
      totalTokens: final.usage?.totalTokens,
      truncated: final.stopReason === "length",
      toolCalls: toolCalls.length ? toolCalls : void 0,
      error: final.stopReason === "error" || final.stopReason === "aborted" ? final.errorMessage ?? final.stopReason : void 0
    });
    if (process.env.NODE_ENV !== "production") {
      console.debug("[pi-llm-log] logging finalized", {
        logId,
        durationMs,
        correlationId: params.correlationId,
        stopReason: final.stopReason
      });
    }
  } catch (err) {
    const durationMs = Math.round(performance.now() - t0);
    failLlmCall(logId, normalizeError(err), durationMs);
    if (process.env.NODE_ENV !== "production") {
      console.debug("[pi-llm-log] logging failed", {
        logId,
        durationMs,
        correlationId: params.correlationId,
        error: normalizeError(err)
      });
    }
  } finally {
    if (params.turnLogRef.current === logId) {
      params.turnLogRef.current = void 0;
    }
  }
}
function findLastAssistantMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && typeof m === "object" && !Array.isArray(m)) {
      const role = m.role;
      if (role === "assistant") return m;
    }
  }
  return void 0;
}
function emitEvent(onEvent, event, optionsOrOnFail) {
  const opts = typeof optionsOrOnFail === "function" ? { onFail: optionsOrOnFail } : optionsOrOnFail ?? {};
  const label = opts.label ?? "[pi-emit]";
  const handle2 = (e) => {
    console.error(`${label} onEvent failed`, normalizeError(e), e);
    opts.onFail?.(e);
  };
  try {
    const ret = onEvent(event);
    if (ret && typeof ret.then === "function") {
      ret.catch(handle2);
    }
  } catch (e) {
    handle2(e);
  }
}
function safeBridgeEmit(ctx, event) {
  emitEvent(ctx.onEvent, event, {
    label: "[bridge]",
    onFail: ctx.onStreamDeliveryFailure
  });
}
function handleCompactionStart(ctx, event) {
  const reasonLabel = event.reason === "overflow" ? "overflow recovery" : event.reason === "threshold" ? "threshold" : "manual";
  safeBridgeEmit(ctx, { type: "progress", payload: `Compacting context (${reasonLabel})…` });
  safeBridgeEmit(
    ctx,
    ctx.trace("compaction", "Compacting context window", {
      phase: "building",
      detail: `reason=${event.reason}`
    })
  );
}
function handleAgentEnd(ctx, event) {
  if (event.type !== "agent_end") return;
  const messages = event.messages;
  const lastAssistant = findLastAssistantMessage(messages);
  if (!lastAssistant || lastAssistant.stopReason !== "error") return;
  const errMsg = lastAssistant.errorMessage?.trim() || "Model stream error";
  const traceRow = {
    id: crypto.randomUUID(),
    at: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "tool_failed",
    label: "Agent ended with model error",
    phase: "building",
    status: "error",
    detail: errMsg.slice(0, 512)
  };
  safeBridgeEmit(ctx, { type: "trace", trace: traceRow });
  safeBridgeEmit(ctx, { type: "error", payload: errMsg });
}
function handleCompactionEnd(ctx, event) {
  const result = event.result;
  const detailBits = [`reason=${event.reason}`];
  if (event.aborted) detailBits.push("aborted");
  if (event.willRetry) detailBits.push("willRetry");
  if (event.errorMessage) detailBits.push(`error=${event.errorMessage}`);
  if (result) {
    detailBits.push(`tokensBefore=${result.tokensBefore}`);
    detailBits.push(`summaryChars=${result.summary.length}`);
    const d = parseCompactionDetails(result.details);
    if (d?.modifiedFiles?.length) detailBits.push(`modifiedFiles=${d.modifiedFiles.length}`);
    if (d?.readFiles?.length) detailBits.push(`readFiles=${d.readFiles.length}`);
  }
  const rehydrationHint = "Rehydrate: use_skill for needed sandbox guides; use last todo_write / checkpoint lists; re-read key HTML/CSS/JS you were editing; grep if uncertain.";
  safeBridgeEmit(
    ctx,
    ctx.trace(
      "compaction",
      event.aborted ? "Context compaction aborted" : event.errorMessage ? "Context compaction finished with warning" : "Context compaction finished",
      {
        phase: "building",
        status: event.errorMessage ? "warning" : event.aborted ? "warning" : "success",
        detail: `${detailBits.join("; ")} — ${rehydrationHint}`
      }
    )
  );
}
const AGENTIC_PROGRESS_WORKING = "Agent working…";
const RUN_TRACE_LABEL_AGENT_WORKING = "Agent working";
const DEBUG_AGENT_INGEST_URL = "http://127.0.0.1:7576/ingest/83c687e1-03e6-457d-9b2a-e5ea8f1db0e1";
const DEBUG_AGENT_INGEST_SESSION_ID = "5b9be9";
function buildDebugAgentIngestBody(payload) {
  const sessionId = payload.sessionId ?? DEBUG_AGENT_INGEST_SESSION_ID;
  return JSON.stringify({
    ...payload,
    sessionId,
    timestamp: Date.now()
  });
}
function debugAgentIngest(payload) {
  if (process.env.DEBUG_AGENT_INGEST !== "1") return;
  const sessionId = payload.sessionId ?? DEBUG_AGENT_INGEST_SESSION_ID;
  fetch(DEBUG_AGENT_INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": sessionId
    },
    body: buildDebugAgentIngestBody(payload)
  }).catch(() => {
  });
}
function serializePiToolArgsForTrace(raw, maxChars = PI_TOOL_ARGS_TRACE_MAX_CHARS) {
  if (raw == null) return void 0;
  if (typeof raw !== "object") return void 0;
  try {
    return truncateUtf16WithSuffix(JSON.stringify(raw), maxChars);
  } catch {
    return void 0;
  }
}
function extractTextFromAgentToolResult(result) {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object" && result !== null && "message" in result) {
    const m = result.message;
    if (typeof m === "string") return m;
  }
  const r = result;
  if (!Array.isArray(r.content)) return "";
  const parts = [];
  for (const block of r.content) {
    if (block && typeof block === "object" && block.type === "text") {
      const t = block.text;
      if (typeof t === "string") parts.push(t);
    }
  }
  return parts.join("\n");
}
function serializePiToolResultForTrace(result, isError, maxChars = PI_TOOL_RESULT_TRACE_MAX_CHARS) {
  if (result == null) return isError ? "(no result)" : void 0;
  let text;
  if (isError) {
    if (result instanceof Error) {
      text = result.message || String(result);
    } else {
      text = extractTextFromAgentToolResult(result);
      if (!text) {
        try {
          text = typeof result === "object" ? JSON.stringify(result) : String(result);
        } catch {
          text = normalizeError(result);
        }
      }
    }
  } else {
    text = extractTextFromAgentToolResult(result);
  }
  const trimmed = text.trim();
  if (!trimmed) return isError ? "(empty result)" : void 0;
  return truncateUtf16WithSuffix(trimmed, maxChars);
}
function emitFirstTokenIfNeeded(ctx) {
  if (ctx.waitingForFirstToken.current) {
    ctx.waitingForFirstToken.current = false;
    safeBridgeEmit(
      ctx,
      ctx.trace("model_first_token", "First streamed model token received", {
        phase: "building",
        status: "success"
      })
    );
  }
}
function toolStartProgressPayload(toolName, path2, _pattern, command) {
  if (toolName === "bash") {
    const c = command ?? "";
    const short = c.length > LOG_PREVIEW_SNIPPET_MAX ? `${c.slice(0, LOG_PREVIEW_SNIPPET_HEAD_CHARS)}…` : c;
    return short ? `Running: ${short}` : "Running shell command…";
  }
  switch (toolName) {
    case "validate_js":
    case "validate_html":
      return `Validating ${path2 ?? "file"}…`;
    case "todo_write":
      return "Updating tasks…";
    case "use_skill":
      return path2 ? `Loading skill: ${path2}…` : "Loading skill…";
    default:
      return `Running ${toolName}…`;
  }
}
function bumpStreamActivity(ctx) {
  ctx.streamActivityAt.current = Date.now();
}
function syncPendingToolProbe(ctx, toolStartMs) {
  if (ctx.pendingToolCallsRef) ctx.pendingToolCallsRef.current = toolStartMs.size;
}
const STREAMING_TOOL_EMIT_INTERVAL_MS = 500;
function handleAssistantTextStreamDelta(ctx, rawDelta, kind) {
  if (!rawDelta) return;
  emitFirstTokenIfNeeded(ctx);
  const delta = stripProviderControlTokens(rawDelta);
  if (!delta) return;
  bumpStreamActivity(ctx);
  const logId = ctx.turnLogRef.current;
  if (logId) appendLlmCallResponse(logId, delta);
  if (kind === "activity") {
    safeBridgeEmit(ctx, { type: "activity", payload: delta });
    return;
  }
  safeBridgeEmit(ctx, {
    type: "thinking",
    payload: delta,
    turnId: ctx.modelTurnId.current
  });
}
function handleTurnStart(ctx, maps) {
  const { toolStartMs } = maps;
  bumpStreamActivity(ctx);
  ctx.modelTurnId.current += 1;
  safeBridgeEmit(ctx, { type: "progress", payload: AGENTIC_PROGRESS_WORKING });
  ctx.waitingForFirstToken.current = true;
  safeBridgeEmit(
    ctx,
    ctx.trace("model_turn_start", RUN_TRACE_LABEL_AGENT_WORKING, {
      phase: "building"
    })
  );
  debugAgentIngest({
    hypothesisId: "H1",
    location: "pi-bridge-tool-streaming.ts:turn_start",
    message: "model turn_start",
    data: {
      modelTurnId: ctx.modelTurnId.current,
      pendingToolCalls: toolStartMs.size
    }
  });
  syncPendingToolProbe(ctx, toolStartMs);
}
function handleMessageUpdate(ctx, maps, event) {
  const msg = event.assistantMessageEvent;
  const { streamingToolByIndex } = maps;
  switch (msg.type) {
    case "text_delta": {
      handleAssistantTextStreamDelta(ctx, msg.delta, "activity");
      return;
    }
    case "thinking_delta": {
      handleAssistantTextStreamDelta(ctx, msg.delta, "thinking");
      return;
    }
    case "toolcall_start": {
      emitFirstTokenIfNeeded(ctx);
      bumpStreamActivity(ctx);
      const idx = msg.contentIndex;
      const { toolName, toolPath } = toolMetaFromPartialNarrowed(msg.partial, idx);
      const now2 = Date.now();
      streamingToolByIndex.set(idx, {
        toolName,
        toolPath,
        streamedChars: 0,
        lastEmitAt: now2
      });
      safeBridgeEmit(ctx, {
        type: "streaming_tool",
        toolName,
        streamedChars: 0,
        done: false,
        ...toolPath != null ? { toolPath } : {}
      });
      return;
    }
    case "toolcall_delta": {
      if (!msg.delta) return;
      emitFirstTokenIfNeeded(ctx);
      bumpStreamActivity(ctx);
      const idx = msg.contentIndex;
      let acc = streamingToolByIndex.get(idx);
      if (!acc) {
        const meta = toolMetaFromPartialNarrowed(msg.partial, idx);
        const now2 = Date.now();
        acc = {
          toolName: meta.toolName,
          toolPath: meta.toolPath,
          streamedChars: 0,
          lastEmitAt: now2
        };
        streamingToolByIndex.set(idx, acc);
      }
      const pathFromPartial = extractToolPathFromAssistantPartial(msg.partial, idx);
      if (pathFromPartial && !acc.toolPath) acc.toolPath = pathFromPartial;
      acc.streamedChars += msg.delta.length;
      const t = Date.now();
      if (t - acc.lastEmitAt >= STREAMING_TOOL_EMIT_INTERVAL_MS) {
        acc.lastEmitAt = t;
        safeBridgeEmit(ctx, {
          type: "streaming_tool",
          toolName: acc.toolName,
          streamedChars: acc.streamedChars,
          done: false,
          ...acc.toolPath != null ? { toolPath: acc.toolPath } : {}
        });
      }
      return;
    }
    case "toolcall_end": {
      bumpStreamActivity(ctx);
      const idx = msg.contentIndex;
      const acc = streamingToolByIndex.get(idx);
      const tcNarrowed = parsePiToolCallEnd(msg.toolCall);
      const tc = tcNarrowed ?? {};
      const toolName = (typeof tc.name === "string" && tc.name.length > 0 ? tc.name : acc?.toolName) ?? "tool";
      const toolPath = toolPathFromNarrowedToolCall(tc) ?? acc?.toolPath;
      const streamedChars = acc?.streamedChars ?? 0;
      streamingToolByIndex.delete(idx);
      safeBridgeEmit(ctx, {
        type: "streaming_tool",
        toolName,
        streamedChars,
        done: true,
        ...toolPath != null ? { toolPath } : {}
      });
      return;
    }
    default:
      return;
  }
}
function handleToolExecutionStart(ctx, maps, event) {
  if (event.type !== "tool_execution_start") return;
  const { toolStartMs } = maps;
  bumpStreamActivity(ctx);
  const tn = event.toolName;
  const rawArgs = parseUnknownArgsRecord(event.args);
  const command = typeof rawArgs?.command === "string" ? rawArgs.command : void 0;
  const { path: path2, pattern } = parsePiToolExecutionArgs(tn, event.args);
  const reusedToolCallId = toolStartMs.has(event.toolCallId);
  toolStartMs.set(event.toolCallId, Date.now());
  debugAgentIngest({
    hypothesisId: "H2",
    location: "pi-bridge-tool-streaming.ts:tool_execution_start",
    message: "tool_execution_start",
    data: {
      toolCallId: event.toolCallId,
      toolName: tn,
      path: path2,
      pattern,
      reusedToolCallId,
      commandPreview: command != null && command.length > LOG_COMMAND_PREVIEW_MAX ? `${command.slice(0, LOG_COMMAND_PREVIEW_HEAD_CHARS)}…` : command,
      pendingAfter: toolStartMs.size
    }
  });
  syncPendingToolProbe(ctx, toolStartMs);
  ctx.toolPathByCallId.set(event.toolCallId, path2);
  const toolArgs = serializePiToolArgsForTrace(rawArgs);
  ctx.toolArgsByCallId.set(event.toolCallId, toolArgs);
  safeBridgeEmit(
    ctx,
    ctx.trace("tool_started", path2 ? `${tn} → ${path2}` : `Started ${tn}`, {
      phase: "building",
      toolName: tn,
      path: path2,
      ...toolArgs != null ? { toolArgs } : {}
    })
  );
  safeBridgeEmit(ctx, {
    type: "progress",
    payload: toolStartProgressPayload(tn, path2, pattern, command)
  });
}
function handleToolExecutionEnd(ctx, maps, event) {
  if (event.type !== "tool_execution_end") return;
  const { toolStartMs } = maps;
  bumpStreamActivity(ctx);
  const started = toolStartMs.get(event.toolCallId);
  const durationMs = started != null ? Date.now() - started : void 0;
  toolStartMs.delete(event.toolCallId);
  debugAgentIngest({
    hypothesisId: started == null ? "H3" : "H2",
    location: "pi-bridge-tool-streaming.ts:tool_execution_end",
    message: "tool_execution_end",
    data: {
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      isError: event.isError,
      durationMs,
      hadMatchedStart: started != null,
      orphanEnd: started == null,
      pendingAfter: toolStartMs.size
    }
  });
  syncPendingToolProbe(ctx, toolStartMs);
  const resultText = serializePiToolResultForTrace(event.result, event.isError);
  const traceResultFields = resultText != null ? { detail: resultText, toolResult: resultText } : {};
  if (event.isError) {
    const path2 = ctx.toolPathByCallId.get(event.toolCallId);
    const failedArgs = ctx.toolArgsByCallId.get(event.toolCallId);
    safeBridgeEmit(
      ctx,
      ctx.trace("tool_failed", `Tool failed: ${event.toolName}`, {
        phase: "building",
        toolName: event.toolName,
        path: path2,
        status: "error",
        ...traceResultFields,
        ...failedArgs != null ? { toolArgs: failedArgs } : {}
      })
    );
    safeBridgeEmit(ctx, {
      type: "progress",
      payload: `Tool failed: ${event.toolName}`
    });
  } else {
    const path2 = ctx.toolPathByCallId.get(event.toolCallId);
    safeBridgeEmit(
      ctx,
      ctx.trace("tool_finished", `Finished ${event.toolName}`, {
        phase: "building",
        toolName: event.toolName,
        path: path2,
        status: "success",
        ...traceResultFields
      })
    );
  }
  ctx.toolPathByCallId.delete(event.toolCallId);
  ctx.toolArgsByCallId.delete(event.toolCallId);
}
function subscribePiSessionBridge(session, ctx) {
  const maps = {
    toolStartMs: /* @__PURE__ */ new Map(),
    streamingToolByIndex: /* @__PURE__ */ new Map()
  };
  if (ctx.pendingToolCallsRef) ctx.pendingToolCallsRef.current = maps.toolStartMs.size;
  return session.subscribe((event) => {
    switch (event.type) {
      case "turn_start":
        handleTurnStart(ctx, maps);
        return;
      case "message_update":
        handleMessageUpdate(ctx, maps, event);
        return;
      case "tool_execution_start":
        handleToolExecutionStart(ctx, maps, event);
        return;
      case "tool_execution_end":
        handleToolExecutionEnd(ctx, maps, event);
        return;
      case "compaction_start":
        handleCompactionStart(ctx, event);
        return;
      case "compaction_end":
        handleCompactionEnd(ctx, event);
        return;
      case "agent_end":
        handleAgentEnd(ctx, event);
        return;
      case "message_start":
      case "message_end":
      case "turn_end":
        return;
      default:
        if (process.env.NODE_ENV !== "production") {
          console.debug("[bridge] unhandled Pi event type:", event.type);
        }
    }
  });
}
const NO_FILES_MESSAGE = "Agent completed without creating design files in the sandbox. Try a model that supports tool use, or ensure the bash tool runs successfully.";
class StreamIdleError extends Error {
  name = "StreamIdleError";
  idleMs;
  correlationId;
  constructor(idleMs, correlationId) {
    super(
      `Pi session aborted: no stream activity for ${(idleMs / 1e3).toFixed(0)}s` + (correlationId ? ` (correlationId=${correlationId})` : "") + ". Likely a server-side stall mid-stream after the request was accepted."
    );
    this.idleMs = idleMs;
    this.correlationId = correlationId;
  }
}
const STREAM_IDLE_LIMIT_MS = 24e4;
const STREAM_IDLE_CHECK_INTERVAL_MS = 3e3;
async function resolveProviderConfig(providerId, modelId) {
  if (providerId !== "openrouter" && providerId !== "lmstudio") {
    throw new Error(`pi-agent-runtime: unsupported provider "${providerId}"`);
  }
  const provider = providerId === "openrouter" ? {
    id: "openrouter",
    baseUrl: `${env.OPENROUTER_BASE_URL}/api/v1`,
    apiKey: env.OPENROUTER_API_KEY
  } : { id: "lmstudio", baseUrl: env.LMSTUDIO_URL };
  const registryCw = await getProviderModelContextWindow(providerId, modelId);
  const fallbackCw = providerId === "lmstudio" ? env.LM_STUDIO_CONTEXT_WINDOW : FALLBACK_OPENROUTER_CONTEXT_WINDOW;
  return { provider, contextWindow: registryCw ?? fallbackCw };
}
function dispatchSessionFactory(sessionType, baseOpts, seedFiles) {
  switch (sessionType) {
    case "evaluation":
      return createEvaluationSession(baseOpts);
    case "incubation":
      return createIncubationSession(baseOpts);
    case "inputs-gen":
      return createInputsGenSession(baseOpts);
    case "design-system":
      return createDesignSystemSession(baseOpts);
    case "design":
    default:
      return createDesignSession({ ...baseOpts, seedFiles });
  }
}
function mapPackageResult(result, seedFiles) {
  const hasRevisionSeed = !!seedFiles && Object.keys(seedFiles).length > 0;
  const outputVsSeed = hasRevisionSeed ? computeDesignFilesBeyondSeed(result.files, seedFiles) : result.files;
  if (Object.keys(outputVsSeed).length === 0 && !result.aborted) {
    return { ok: false, reason: "no_files", message: NO_FILES_MESSAGE };
  }
  return {
    ok: true,
    result: {
      files: result.files,
      todos: result.todos,
      emittedFilePaths: result.emittedFilePaths
    }
  };
}
function buildPackageResourceLoader(input) {
  const loader = new DefaultResourceLoader({
    cwd: input.cwd,
    /** Required since Pi 0.72 even when project-local discovery is disabled. */
    agentDir: input.cwd,
    /** Disable project-local discovery — we point at the package's bundled paths instead. */
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    extensionFactories: input.extensionFactories,
    additionalSkillPaths: [PACKAGE_SKILLS_DIR],
    additionalPromptTemplatePaths: [PACKAGE_PROMPTS_DIR],
    systemPrompt: input.systemPrompt
  });
  return Promise.resolve(loader).then(async (l) => {
    await l.reload();
    return l;
  });
}
function createTraceEvent(kind, label, extra = {}) {
  return {
    type: "trace",
    trace: {
      id: crypto.randomUUID(),
      at: (/* @__PURE__ */ new Date()).toISOString(),
      kind,
      label,
      status: "info",
      ...extra
    }
  };
}
async function runPiAgentSession(params, onEvent) {
  const { provider, contextWindow } = await resolveProviderConfig(
    params.providerId,
    params.modelId
  );
  const startMessage = params.initialProgressMessage ?? "Starting agentic generation...";
  await onEvent({ type: "progress", payload: startMessage });
  await onEvent(createTraceEvent("run_started", startMessage, { phase: "building" }));
  const systemPromptBody = (params.systemPrompt?.trim() || loadDesignerSystemPrompt()).trim();
  const onFile = (path2, content) => {
    void onEvent({ type: "file", path: path2, content });
    void onEvent(
      createTraceEvent("file_written", `Saved ${path2}`, {
        phase: "building",
        path: path2,
        status: "success"
      })
    );
  };
  const onTodos = (todos) => {
    void onEvent({ type: "todos", todos });
  };
  const onPackageEvent = (e) => {
    if (e.type === "agent_end" && e.errorMessage) {
      void onEvent({ type: "error", payload: e.errorMessage });
    }
  };
  const baseOpts = {
    provider,
    modelId: params.modelId,
    contextWindow,
    thinkingLevel: params.thinkingLevel,
    systemPrompt: systemPromptBody,
    userPrompt: params.userPrompt,
    signal: params.signal,
    correlationId: params.correlationId,
    onFile,
    onTodos,
    onEvent: onPackageEvent,
    buildResourceLoader: ({ extensionFactories }) => buildPackageResourceLoader({
      systemPrompt: systemPromptBody,
      extensionFactories,
      cwd: SANDBOX_PROJECT_ROOT
    })
  };
  const handle2 = await dispatchSessionFactory(params.sessionType, baseOpts, params.seedFiles);
  const llmTurnLogRef = {};
  const pendingLogFinalizers = /* @__PURE__ */ new Set();
  const prevStream = handle2.session.agent.streamFn;
  handle2.session.agent.streamFn = wrapPiStreamWithLogging(prevStream, {
    providerId: params.providerId,
    modelId: params.modelId,
    source: mapSessionTypeToLlmLogSource(params.sessionType),
    phase: params.phase === "revision" ? PI_LLM_LOG_PHASE.REVISION : PI_LLM_LOG_PHASE.AGENTIC_TURN,
    turnLogRef: llmTurnLogRef,
    correlationId: params.correlationId,
    pendingLogFinalizers
  });
  const bridgeCtx = {
    onEvent,
    trace: createTraceEvent,
    toolPathByCallId: /* @__PURE__ */ new Map(),
    toolArgsByCallId: /* @__PURE__ */ new Map(),
    waitingForFirstToken: { current: false },
    turnLogRef: llmTurnLogRef,
    streamActivityAt: { current: Date.now() },
    modelTurnId: { current: 0 },
    pendingToolCallsRef: { current: 0 },
    onStreamDeliveryFailure: () => handle2.session.agent.abort()
  };
  const unsubscribeBridge = subscribePiSessionBridge(handle2.session, bridgeCtx);
  if (env.isDev) {
    console.debug("[pi-agent-runtime] session start", {
      correlationId: params.correlationId,
      provider: params.providerId,
      model: params.modelId,
      contextWindow,
      seedFileCount: params.seedFiles ? Object.keys(params.seedFiles).length : 0,
      sessionType: params.sessionType
    });
  }
  let watchdogReject;
  const watchdogPromise = new Promise((_, rej) => {
    watchdogReject = rej;
  });
  const watchdogTimer = setInterval(() => {
    const idleMs = Date.now() - bridgeCtx.streamActivityAt.current;
    if (idleMs > STREAM_IDLE_LIMIT_MS) {
      clearInterval(watchdogTimer);
      if (env.isDev) {
        console.warn("[pi-agent-runtime] stream-idle watchdog firing", {
          correlationId: params.correlationId,
          idleMs,
          modelTurnId: bridgeCtx.modelTurnId.current,
          pendingToolCalls: bridgeCtx.pendingToolCallsRef?.current
        });
      }
      void handle2.session.agent.abort();
      watchdogReject?.(new StreamIdleError(idleMs, params.correlationId));
    }
  }, STREAM_IDLE_CHECK_INTERVAL_MS);
  let result;
  try {
    const t0 = performance.now();
    result = await Promise.race([handle2.run(), watchdogPromise]);
    if (env.isDev) {
      console.debug("[pi-agent-runtime] session done", {
        correlationId: params.correlationId,
        durationMs: Math.round(performance.now() - t0),
        fileCount: Object.keys(result.files).length,
        todoCount: result.todos.length,
        aborted: result.aborted
      });
    }
  } catch (err) {
    console.error("[pi-agent-runtime] handle.run failed", normalizeError(err), err);
    await onEvent({ type: "error", payload: `Agent error: ${normalizeProviderError(err)}` });
    if (err instanceof StreamIdleError) {
      throw err;
    }
    return null;
  } finally {
    clearInterval(watchdogTimer);
    unsubscribeBridge();
    if (pendingLogFinalizers.size > 0) {
      await Promise.allSettled([...pendingLogFinalizers]);
    }
  }
  if (result.errorMessage) {
    await onEvent({ type: "error", payload: result.errorMessage });
  }
  const outcome = mapPackageResult(result, params.seedFiles);
  if (!outcome.ok) {
    await onEvent({ type: "error", payload: outcome.message });
    return null;
  }
  return outcome.result;
}
async function runTaskAgentPiSession(input, forward) {
  const ctx = await buildAgenticSystemContext({ sessionType: input.sessionType });
  await emitSkillsLoadedEvents(forward, ctx.loadedSkills, "building");
  const sessionResult = await runPiAgentSession(
    {
      userPrompt: input.userPrompt,
      providerId: input.providerId,
      modelId: input.modelId,
      thinkingLevel: input.thinking?.level,
      signal: input.signal,
      correlationId: input.correlationId,
      sessionType: input.sessionType,
      systemPrompt: ctx.systemPrompt,
      seedFiles: ctx.sandboxSeedFiles,
      initialProgressMessage: input.initialProgressMessage ?? "Starting task…"
    },
    (event) => forward(event)
  );
  return {
    sessionResult,
    skillKeys: ctx.loadedSkills.map((skill) => skill.key)
  };
}
class TaskAgentExecutionError extends Error {
  outcome;
  constructor(message, outcome = "error") {
    super(message);
    this.name = "TaskAgentExecutionError";
    this.outcome = outcome;
  }
}
async function executeTaskAgentStream(stream, input, options) {
  const startedAt = Date.now();
  const correlationId = input.correlationId ?? crypto.randomUUID();
  let outcome = "error";
  let errorMessage;
  let resultFileUsed;
  let sandboxFileCount = 0;
  const gate = options.writeGate ?? createWriteGate();
  const logContext = {
    sessionType: input.sessionType,
    correlationId,
    providerId: input.providerId,
    modelId: input.modelId
  };
  const log2 = env.isDev ? console.debug : console.info;
  const write = async (event, data) => {
    const payload = JSON.stringify(data);
    await gate.enqueue(async () => {
      await stream.writeSSE({ data: payload, event, id: options.allocId() });
    });
  };
  const writeEvent = async (event) => {
    if (input.signal?.aborted) return;
    const { sseEvent, data } = agenticOrchestratorEventToSse(event);
    await write(sseEvent, data);
  };
  const acquired = await acquireTaskAgentSlot();
  if (!acquired) {
    errorMessage = "Too many agentic runs are active. Please wait and try again.";
    emitTaskRunLine({
      sessionType: input.sessionType,
      correlationId,
      providerId: input.providerId,
      modelId: input.modelId,
      durationMs: Date.now() - startedAt,
      outcome: "error",
      sandboxFileCount: 0,
      errorMessage,
      thinking: input.thinking
    });
    throw new TaskAgentExecutionError(errorMessage, "error");
  }
  try {
    log2("[task-agent] acquired", logContext);
    await write(SSE_EVENT_NAMES.phase, { phase: "building" });
    log2("[task-agent] first_sse_write", logContext);
    log2("[task-agent] pi_session_start", logContext);
    const { sessionResult, skillKeys } = await runTaskAgentPiSession(
      {
        userPrompt: input.userPrompt,
        providerId: input.providerId,
        modelId: input.modelId,
        sessionType: input.sessionType,
        thinking: input.thinking,
        signal: input.signal,
        correlationId,
        initialProgressMessage: input.initialProgressMessage
      },
      writeEvent
    );
    log2("[task-agent] pi_session_end", {
      ...logContext,
      hasResult: Boolean(sessionResult),
      skillCount: skillKeys.length
    });
    if (!sessionResult) {
      errorMessage = "Agent session completed without result.";
      throw new TaskAgentExecutionError(errorMessage, "no_result");
    }
    sandboxFileCount = Object.keys(sessionResult.files).length;
    const resultFile = input.resultFile ?? "result.json";
    resultFileUsed = resultFile;
    const resolved = resolveTaskAgentResultFile({
      files: sessionResult.files,
      resultFile,
      fallback: input.resultFileFallback ?? "firstNonEmptyFile"
    });
    if (resolved) {
      outcome = "success";
      resultFileUsed = resolved.resultFile;
      emitTaskResultLine({
        sessionType: input.sessionType,
        correlationId,
        resultFile: resolved.resultFile,
        resultContent: resolved.result,
        files: sessionResult.files
      });
      writeSuccessfulTaskRunDiskLog({
        baseDir: env.OBSERVABILITY_LOG_BASE_DIR,
        correlationId,
        sessionType: input.sessionType,
        providerId: input.providerId,
        modelId: input.modelId,
        userPrompt: input.userPrompt,
        resultFile: resolved.resultFile,
        resultContent: resolved.result,
        sandboxFilePaths: Object.keys(sessionResult.files),
        skillKeys,
        durationMs: Date.now() - startedAt
      });
      return { result: resolved.result, resultFile: resolved.resultFile, files: sessionResult.files };
    }
    outcome = "no_result";
    errorMessage = `Agent did not write the expected result file (${resultFile}).`;
    throw new TaskAgentExecutionError(errorMessage, "no_result");
  } catch (err) {
    errorMessage = normalizeError(err);
    if (err instanceof TaskAgentExecutionError) {
      outcome = err.outcome;
    } else {
      outcome = "error";
    }
    throw err;
  } finally {
    log2("[task-agent] finished", {
      ...logContext,
      durationMs: Date.now() - startedAt,
      outcome,
      resultFile: resultFileUsed,
      sandboxFileCount
    });
    emitTaskRunLine({
      sessionType: input.sessionType,
      correlationId,
      providerId: input.providerId,
      modelId: input.modelId,
      durationMs: Date.now() - startedAt,
      outcome,
      resultFile: resultFileUsed,
      sandboxFileCount,
      errorMessage: outcome !== "success" ? errorMessage : void 0,
      thinking: input.thinking
    });
    releaseTaskAgentSlot();
  }
}
function runTaskAgentRoute(c, options) {
  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    const correlationId = crypto.randomUUID();
    const logContext = {
      route: options.routeLabel,
      correlationId,
      providerId: options.body.providerId,
      modelId: options.body.modelId,
      ...options.debugPayload?.(options.body)
    };
    const log2 = env.isDev ? console.debug : console.info;
    log2(`[task-route] request`, logContext);
    await runTaskAgentSseBody(stream, async ({ write, allocId, gate }) => {
      const thinking = resolveThinkingConfig(
        options.thinkingTask,
        options.body.modelId,
        options.body.thinking
      );
      log2(`[task-route] execute`, {
        route: options.routeLabel,
        correlationId,
        thinkingLevel: thinking?.level,
        thinkingBudgetTokens: thinking?.budgetTokens
      });
      const taskResult = await executeTaskAgentStream(
        stream,
        {
          userPrompt: options.userPrompt,
          providerId: options.body.providerId,
          modelId: options.body.modelId,
          sessionType: options.sessionType,
          thinking,
          signal: abortSignal,
          correlationId,
          resultFile: options.resultFile,
          resultFileFallback: options.resultFileFallback ?? "firstNonEmptyFile",
          initialProgressMessage: options.initialProgressMessage
        },
        { allocId, writeGate: gate }
      );
      log2(`[task-route] result`, {
        route: options.routeLabel,
        correlationId,
        resultFile: taskResult.resultFile,
        fileCount: Object.keys(taskResult.files).length
      });
      await options.onTaskResult(taskResult, { write, correlationId });
    });
  });
}
async function runBrainstormPrelude(input) {
  const trimmedBrief = input.designBrief.trim();
  if (!trimmedBrief) {
    throw new Error("Brainstorm prelude requires a non-empty design brief.");
  }
  const brainstormGuidance = await getPromptBody("incubator-brainstorm-system");
  const brainstormPrompt = `${brainstormGuidance}

<brief>
${trimmedBrief}
</brief>`;
  const brainstormSession = await runTaskAgentPiSession(
    {
      userPrompt: brainstormPrompt,
      providerId: input.providerId,
      modelId: input.modelId,
      sessionType: "inputs-gen",
      signal: input.signal,
      correlationId: input.correlationId,
      initialProgressMessage: "Brainstorming directions…"
    },
    async () => {
    }
  );
  if (!brainstormSession.sessionResult) {
    throw new Error("Brainstorm prelude returned no session result.");
  }
  const brainstormResolved = resolveTaskAgentResultFile({
    files: brainstormSession.sessionResult.files,
    resultFile: "result.md",
    fallback: "firstNonEmptyFile"
  });
  if (!brainstormResolved || !brainstormResolved.result.trim()) {
    throw new Error("Brainstorm prelude returned no result.");
  }
  const brainstormText = brainstormResolved.result.trim();
  const curationGuidance = await getPromptBody("incubator-curation-system");
  const curationPrompt = `${curationGuidance}

<brainstorm_directions>
${brainstormText}
</brainstorm_directions>`;
  const curationSession = await runTaskAgentPiSession(
    {
      userPrompt: curationPrompt,
      providerId: input.providerId,
      modelId: input.modelId,
      sessionType: "inputs-gen",
      signal: input.signal,
      correlationId: randomUUID(),
      initialProgressMessage: "Curating top 5…"
    },
    async () => {
    }
  );
  if (!curationSession.sessionResult) {
    throw new Error("Curation prelude returned no session result.");
  }
  const curationResolved = resolveTaskAgentResultFile({
    files: curationSession.sessionResult.files,
    resultFile: "result.md",
    fallback: "firstNonEmptyFile"
  });
  if (!curationResolved || !curationResolved.result.trim()) {
    throw new Error("Curation prelude returned no result.");
  }
  const curatedText = curationResolved.result.trim();
  const augmentedBrief = `${trimmedBrief}

<product_shape_candidates>
${curatedText}
</product_shape_candidates>`;
  return { augmentedBrief, curatedText };
}
const ReferenceImageSchema = z.object({
  id: z.string(),
  filename: z.string(),
  dataUrl: z.string(),
  description: z.string(),
  extractedContext: z.string().optional(),
  createdAt: z.string()
});
const SpecSectionSchema = z.object({
  id: z.enum([
    "design-brief",
    "existing-design",
    "research-context",
    "objectives-metrics",
    "design-constraints",
    "design-system"
  ]),
  content: z.string(),
  images: z.array(ReferenceImageSchema),
  lastModified: z.string()
});
const DesignSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  sections: z.record(z.string(), SpecSectionSchema),
  createdAt: z.string(),
  lastModified: z.string(),
  version: z.number()
});
const DesignSystemMarkdownSourceSchema = z.object({
  id: z.string(),
  filename: z.string(),
  content: z.string(),
  sizeBytes: z.number().int().min(0),
  createdAt: z.string()
});
const DesignMdLintFindingSchema = z.object({
  severity: z.enum(["error", "warning", "info"]),
  message: z.string()
});
const DesignMdLintSummarySchema = z.object({
  errors: z.number().int().min(0),
  warnings: z.number().int().min(0),
  infos: z.number().int().min(0),
  findings: z.array(DesignMdLintFindingSchema).optional()
});
const DesignMdDocumentSchema = z.object({
  content: z.string(),
  sourceHash: z.string(),
  generatedAt: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  lint: DesignMdLintSummarySchema.optional(),
  error: z.string().optional()
});
const DomainDesignSystemContentSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  content: z.string(),
  images: z.array(ReferenceImageSchema),
  markdownSources: z.array(DesignSystemMarkdownSourceSchema).optional(),
  designMdDocument: DesignMdDocumentSchema.optional(),
  providerMigration: z.string().optional(),
  modelMigration: z.string().optional()
});
const WorkspaceSnapshotSchema = z.object({
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown())
});
const DomainHypothesisSchema = z.object({
  id: z.string(),
  incubatorId: z.string(),
  strategyId: z.string(),
  /** @deprecated Pre-Phase-7-D requests may include this; ignored on the server. */
  modelNodeIds: z.array(z.string()).optional(),
  designSystemNodeIds: z.array(z.string()),
  revisionEnabled: z.boolean().optional(),
  maxRevisionRounds: z.number().int().min(0).max(20).optional(),
  minOverallScore: z.union([z.number().min(0).max(5), z.null()]).optional(),
  placeholder: z.boolean()
});
const SettingsModelCredentialSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  thinkingLevel: ThinkingLevelSchema
});
const HypothesisStrategySchema = z.object({
  id: z.string(),
  name: z.string(),
  hypothesis: z.string(),
  rationale: z.string(),
  measurements: z.string(),
  dimensionValues: z.record(z.string(), z.string())
});
const DimensionSchema$2 = z.object({
  name: z.string(),
  range: z.string(),
  isConstant: z.boolean()
});
const HypothesisWorkspaceCoreObjectSchema = z.object({
  hypothesisNodeId: z.string().min(1),
  strategy: HypothesisStrategySchema.optional(),
  hypothesisStrategy: HypothesisStrategySchema.optional(),
  variantStrategy: HypothesisStrategySchema.optional(),
  dimensions: z.array(DimensionSchema$2).optional(),
  spec: DesignSpecSchema,
  snapshot: WorkspaceSnapshotSchema,
  domainHypothesis: DomainHypothesisSchema.nullish(),
  designSystems: z.record(z.string(), DomainDesignSystemContentSchema),
  /** Settings-store credential — Phase 7 D source of truth for routing. */
  settingsCredential: SettingsModelCredentialSchema
});
function coerceStrategy(obj) {
  const strategy2 = obj.strategy ?? obj.hypothesisStrategy ?? obj.variantStrategy;
  if (!strategy2) throw new Error("strategy is required");
  const { hypothesisStrategy, variantStrategy, ...rest } = obj;
  return { ...rest, strategy: strategy2 };
}
const HypothesisWorkspaceCoreWithStrategySchema = HypothesisWorkspaceCoreObjectSchema.refine(
  (obj) => Boolean(obj.strategy ?? obj.hypothesisStrategy ?? obj.variantStrategy),
  { message: "strategy is required" }
);
const HypothesisWorkspaceCoreSchema = HypothesisWorkspaceCoreWithStrategySchema.transform(coerceStrategy);
const PromptBundleRequestSchema = HypothesisWorkspaceCoreSchema;
const HypothesisGenerateRequestSchema = HypothesisWorkspaceCoreObjectSchema.extend({
  supportsVision: z.boolean().optional(),
  evaluatorProviderId: z.string().optional(),
  evaluatorModelId: z.string().optional(),
  agenticMaxRevisionRounds: z.number().int().min(0).max(20).optional(),
  agenticMinOverallScore: z.number().min(0).max(5).optional(),
  rubricWeights: z.object({
    design: z.number().finite().nonnegative().optional(),
    strategy: z.number().finite().nonnegative().optional(),
    implementation: z.number().finite().nonnegative().optional(),
    browser: z.number().finite().nonnegative().optional()
  }).strict().optional(),
  correlationId: z.string().min(1).max(200).optional()
}).refine(
  (obj) => Boolean(obj.strategy ?? obj.hypothesisStrategy ?? obj.variantStrategy),
  { message: "strategy is required" }
).transform(coerceStrategy);
const DesignSystemExtractRequestSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  sourceHash: z.string().optional(),
  images: z.array(
    z.object({
      dataUrl: z.string(),
      mimeType: z.string().optional(),
      name: z.string().optional(),
      filename: z.string().optional(),
      description: z.string().optional()
    }).passthrough()
  ).optional(),
  markdownSources: z.array(DesignSystemMarkdownSourceSchema).optional(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  thinking: ThinkingOverrideSchema.optional()
}).refine((body) => Boolean(body.content?.trim()) || Boolean(body.images?.length) || Boolean(body.markdownSources?.some((source) => source.content.trim())), {
  message: "Provide design-system text, Markdown sources, design-system reference images, or a combination."
});
const InputsGenerateTargetSchema = z.enum([
  "research-context",
  "objectives-metrics",
  "design-constraints"
]);
const InputsGenerateRequestSchema = z.object({
  inputId: InputsGenerateTargetSchema,
  designBrief: z.string().min(1),
  researchContext: z.string().optional(),
  objectivesMetrics: z.string().optional(),
  designConstraints: z.string().optional(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  thinking: ThinkingOverrideSchema.optional()
});
const IncubatorPromptOptionsSchema = z.object({
  count: z.number().int().positive().optional(),
  existingStrategies: z.array(HypothesisStrategySchema).optional(),
  /**
   * When true, the incubate route runs a brainstorm + curation prelude
   * before the main incubator call. The curated 5 product-shape candidates
   * are stitched into the design brief as a `<product_shape_candidates>`
   * block so every downstream stage sees them. Promoted from the
   * experiments tool's "ideation" flow after a 384-cell matrix showed
   * ~15% more distinct themes vs canonical at +50% wall-time cost.
   */
  brainstormFirst: z.boolean().optional()
});
const IncubateRequestSchema = z.object({
  spec: DesignSpecSchema,
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  referenceDesigns: z.array(
    z.object({
      name: z.string(),
      code: z.string()
    })
  ).optional(),
  supportsVision: z.boolean().optional(),
  promptOptions: IncubatorPromptOptionsSchema.optional(),
  thinking: ThinkingOverrideSchema.optional()
});
const MISSING_EXPLORATION_AXIS_POSITION = "not specified";
function normalizeExplorationAxisKey(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
function normalizeDisplayText(value) {
  return value.trim().replace(/\s+/g, " ");
}
function normalizeExplorationAxes(dimensions) {
  const seen = /* @__PURE__ */ new Set();
  const normalized = [];
  for (const dimension of dimensions) {
    const name = normalizeDisplayText(dimension.name);
    if (!name) continue;
    const key = normalizeExplorationAxisKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      name,
      range: normalizeDisplayText(dimension.range),
      isConstant: dimension.isConstant
    });
  }
  return normalized;
}
function normalizeHypothesisAxisPositions(strategy2, dimensions) {
  const axes = normalizeExplorationAxes(dimensions);
  const axisNamesByKey = new Map(axes.map((axis) => [normalizeExplorationAxisKey(axis.name), axis.name]));
  const values = {};
  for (const [rawKey, rawValue] of Object.entries(strategy2.dimensionValues)) {
    const key = normalizeExplorationAxisKey(rawKey);
    if (!key || !axisNamesByKey.has(key)) continue;
    const axisName = axisNamesByKey.get(key);
    if (Object.prototype.hasOwnProperty.call(values, axisName)) continue;
    values[axisName] = normalizeDisplayText(rawValue);
  }
  for (const axis of axes) {
    if (axis.isConstant) continue;
    if (!values[axis.name]) values[axis.name] = MISSING_EXPLORATION_AXIS_POSITION;
  }
  return { ...strategy2, dimensionValues: values };
}
function normalizeIncubationPlanExplorationAxes(plan) {
  const dimensions = normalizeExplorationAxes(plan.dimensions);
  return {
    ...plan,
    dimensions,
    hypotheses: plan.hypotheses.map(
      (strategy2) => normalizeHypothesisAxisPositions(strategy2, dimensions)
    )
  };
}
const incubate = new Hono();
const dimensionRangeSchema$1 = z.union([
  z.string(),
  z.array(z.string()).transform((a) => a.join(", "))
]);
const measurementsSchema = z.union([
  z.string(),
  z.array(z.unknown()).transform((a) => a.map((x) => String(x)).join("; "))
]);
const DimensionSchema$1 = z.object({
  name: z.string().default(""),
  range: dimensionRangeSchema$1.default(""),
  isConstant: z.boolean().default(false)
});
const HypothesisStrategyParseSchema = z.object({
  name: z.string().default("Unnamed Hypothesis"),
  hypothesis: z.string().optional().default(""),
  primaryEmphasis: z.string().optional(),
  rationale: z.string().default(""),
  measurements: measurementsSchema.optional().default(""),
  dimensionValues: z.record(z.string(), z.unknown()).optional().default(() => ({}))
}).transform((v) => ({
  id: generateId(),
  name: v.name,
  hypothesis: v.hypothesis || v.primaryEmphasis || "",
  rationale: v.rationale,
  measurements: v.measurements,
  dimensionValues: Object.fromEntries(
    Object.entries(v.dimensionValues ?? {}).map(([k, val]) => [k, String(val)])
  )
}));
const LLMResponseSchema = z.object({
  dimensions: z.array(z.unknown()).default([]).transform(
    (arr) => arr.map((d) => DimensionSchema$1.parse(typeof d === "object" && d !== null ? d : {}))
  ),
  hypotheses: z.array(z.unknown()).optional(),
  variants: z.array(z.unknown()).optional()
}).transform((obj) => ({
  dimensions: obj.dimensions,
  hypotheses: (obj.hypotheses ?? obj.variants ?? []).map(
    (v) => HypothesisStrategyParseSchema.parse(typeof v === "object" && v !== null ? v : {})
  )
}));
async function applyBrainstormPrelude(c, body, brief) {
  try {
    const { augmentedBrief } = await runBrainstormPrelude({
      designBrief: brief,
      providerId: body.providerId,
      modelId: body.modelId,
      signal: c.req.raw.signal,
      correlationId: randomUUID()
    });
    const briefSection = body.spec.sections["design-brief"];
    if (briefSection) {
      body.spec.sections["design-brief"] = {
        ...briefSection,
        content: augmentedBrief
      };
    }
    return void 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (env.isDev) {
      console.debug("[incubate] brainstorm prelude failed", { message });
    }
    return c.json(
      { error: `Brainstorm prelude failed: ${message}` },
      500
    );
  }
}
incubate.post("/", async (c) => {
  const parsed = await parseRequestJson(c, IncubateRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId, "incubate");
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };
  if (body.promptOptions?.brainstormFirst === true) {
    const brief = body.spec.sections["design-brief"]?.content?.trim();
    if (brief) {
      const preludeError = await applyBrainstormPrelude(c, body, brief);
      if (preludeError) return preludeError;
    }
  }
  const userPromptTemplate = await getPromptBody("incubator-user-inputs");
  const assembledSpec = buildIncubatorUserPrompt(
    body.spec,
    userPromptTemplate,
    body.referenceDesigns,
    body.promptOptions
  );
  const guidance = await inlineGuidance("hypotheses-generator-system", "hypotheses_generator_guidance");
  const agentUserPrompt = `<task>
Analyze the design specification below and produce global exploration axes with hypothesis strategies.

Write the complete JSON result to \`result.json\` in the workspace root. The JSON must contain:
- "dimensions": array of { name, range, isConstant }
- "hypotheses": array of { name, hypothesis, rationale, measurements, dimensionValues }
</task>

${guidance}

${assembledSpec}`;
  return runTaskAgentRoute(c, {
    routeLabel: "incubate",
    body,
    userPrompt: agentUserPrompt,
    sessionType: "incubation",
    thinkingTask: "incubate",
    resultFile: "result.json",
    initialProgressMessage: "Incubating spec to hypotheses…",
    debugPayload: (b) => ({
      specSections: Object.keys(b.spec.sections).length,
      hypothesisCount: b.promptOptions?.count
    }),
    onTaskResult: async (taskResult, { write, correlationId }) => {
      const jsonStr = extractLlmJsonObjectSegment(taskResult.result);
      const raw = parseJsonLenient(jsonStr);
      const { dimensions, hypotheses } = LLMResponseSchema.parse(
        typeof raw === "object" && raw !== null ? raw : {}
      );
      const plan = normalizeIncubationPlanExplorationAxes({
        id: generateId(),
        specId: body.spec.id,
        dimensions,
        hypotheses,
        generatedAt: now(),
        incubatorModel: body.modelId
      });
      if (incubationLooksLikeTemplateEcho(plan)) {
        if (env.isDev) {
          console.debug("[incubate] validation failed: template echo", {
            correlationId,
            hypothesisCount: plan.hypotheses.length
          });
        }
        throw new Error(
          "The model returned placeholder text instead of real hypotheses (often from copying a schema example). Try Generate again, or switch model."
        );
      }
      if (incubationFirstHypothesisEmpty(plan)) {
        if (env.isDev) {
          console.debug("[incubate] validation failed: empty hypothesis text", {
            correlationId,
            hypothesisCount: plan.hypotheses.length
          });
        }
        throw new Error(
          "The model returned no hypothesis text (the core bet field was empty). Try Generate again, or switch model."
        );
      }
      const firstBet = plan.hypotheses[0]?.hypothesis ?? "";
      appendIncubateParsedLogEntry({
        correlationId,
        hypothesisCount: plan.hypotheses.length,
        hypothesisNames: plan.hypotheses.map((h) => h.name),
        firstHypothesisText: firstBet,
        dimensionCount: plan.dimensions.length
      });
      if (env.isDev) {
        console.debug("[incubate] plan parsed (before incubate_result SSE)", {
          correlationId,
          hypothesisCount: plan.hypotheses.length,
          hypothesisNames: plan.hypotheses.map((h) => h.name),
          firstHypothesisText: firstBet.length > 400 ? `${firstBet.slice(0, 400)}…` : firstBet,
          dimensionCount: plan.dimensions.length
        });
      }
      await write(SSE_EVENT_NAMES.incubate_result, JSON.parse(JSON.stringify(plan)));
    }
  });
});
const GENERATION_MODE = {
  AGENTIC: "agentic"
};
const EvaluationContextObjectSchema = z.object({
  strategyName: z.string().optional(),
  hypothesis: z.string().optional(),
  rationale: z.string().optional(),
  measurements: z.string().optional(),
  dimensionValues: z.record(z.string(), z.string()).optional(),
  objectivesMetrics: z.string().optional(),
  designConstraints: z.string().optional(),
  designSystemSnapshot: z.string().optional(),
  outputFormat: z.string().optional()
});
const EvaluationContextSchema = EvaluationContextObjectSchema.nullish();
const RubricWeightsPartialSchema = z.object({
  design: z.number().finite().nonnegative().optional(),
  strategy: z.number().finite().nonnegative().optional(),
  implementation: z.number().finite().nonnegative().optional(),
  browser: z.number().finite().nonnegative().optional()
}).strict();
const GenerateModeSchema = z.union([z.literal("single"), z.literal("agentic")]).optional().default("agentic").transform(() => GENERATION_MODE.AGENTIC);
const GenerateStreamBodySchema = z.object({
  prompt: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  /** Client-issued id to correlate LLM log rows with a UI run (optional). */
  correlationId: z.string().min(1).max(200).optional(),
  supportsVision: z.boolean().optional(),
  mode: GenerateModeSchema,
  /** Legacy field — still accepted for back-compat; prefer `thinking`. */
  thinkingLevel: ThinkingLevelSchema.optional(),
  /** Per-request thinking override (level + budget). Server merges with task defaults. */
  thinking: ThinkingOverrideSchema.optional(),
  evaluationContext: EvaluationContextSchema,
  evaluatorProviderId: z.string().optional(),
  evaluatorModelId: z.string().optional(),
  agenticMaxRevisionRounds: z.number().int().min(0).max(20).optional(),
  agenticMinOverallScore: z.number().min(0).max(5).optional(),
  /** Per-rubric weights merged with defaults and renormalized on the server. */
  rubricWeights: RubricWeightsPartialSchema.optional()
});
function resolvePreviewEntryPath(files) {
  if (files["index.html"]) return "index.html";
  const htmlKeys = Object.keys(files).filter((p) => p.endsWith(".html"));
  if (htmlKeys.length === 0) return "index.html";
  htmlKeys.sort((a, b) => a.localeCompare(b));
  return htmlKeys[0];
}
function encodeVirtualPathForUrl(relPath) {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.split("/").filter((s) => s.length > 0).map(encodeURIComponent).join("/");
}
function resolveVirtualAssetPath(ref, htmlFilePath) {
  const clean = ref.split("#")[0].split("?")[0].trim();
  if (!clean) return void 0;
  if (/^(https?:)?\/\//i.test(clean) || clean.startsWith("data:")) return void 0;
  if (/^(mailto|javascript|tel):/i.test(clean)) return void 0;
  let joined;
  if (clean.startsWith("/")) {
    joined = clean.slice(1);
  } else {
    const lastSlash = htmlFilePath.lastIndexOf("/");
    const dir = lastSlash >= 0 ? htmlFilePath.slice(0, lastSlash) : "";
    joined = dir ? `${dir}/${clean}` : clean;
  }
  const segments = joined.split("/").filter((s) => s.length > 0 && s !== ".");
  const out = [];
  for (const seg of segments) {
    if (seg === "..") {
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}
function generateMissingEntryShell(files) {
  const fileList = Object.entries(files).map(
    ([path2, content]) => `<h3 style="margin:16px 0 4px;font-family:monospace;color:#555">${path2}</h3><pre style="background:#f5f5f5;padding:12px;border-radius:4px;overflow:auto;font-size:12px;margin:0">${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`
  ).join("\n");
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Files</title></head>
<body style="font-family:system-ui;padding:20px;color:#333">
  <h2 style="color:#888">No index.html found — available files:</h2>
  ${fileList}
</body>
</html>`;
}
function bundleVirtualFS(files) {
  const htmlKey = resolvePreviewEntryPath(files);
  let html = files[htmlKey];
  if (!html) return generateMissingEntryShell(files);
  const scriptSrcClose = new RegExp(
    `<script\\s+([^>]*)src=(["'])([^"']+)\\2([^>]*)><\/script>`,
    "gi"
  );
  html = html.replace(
    /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi,
    (match, href) => {
      if (/^(https?:)?\/\//i.test(href)) return match;
      const key = resolveVirtualAssetPath(href, htmlKey);
      if (!key) return match;
      const css = files[key];
      return css ? `<style>
${css}
</style>` : match;
    }
  );
  html = html.replace(scriptSrcClose, (match, before, _quote, src, after) => {
    if (/^(https?:)?\/\//i.test(String(src))) return match;
    const key = resolveVirtualAssetPath(String(src), htmlKey);
    if (!key) return match;
    const js = files[key];
    return js ? `<script ${before}${after}>
${js}
<\/script>` : match;
  });
  return html;
}
function truncateBlock(label, content) {
  if (content.length <= EVAL_FILE_MAX_CHARS) return `<file path="${label}">
${content}
</file>`;
  return `<file path="${label}">
${content.slice(0, EVAL_FILE_MAX_CHARS)}
…[truncated]
</file>`;
}
function buildEvaluatorUserContent(files, compiledPrompt, context, previewPageUrl) {
  let bundled = "";
  try {
    bundled = bundleVirtualFS(files);
  } catch (err) {
    const msg = normalizeError(err, "bundle failed");
    if (env.isDev) {
      console.warn("[eval:bundle]", msg, err);
    }
    bundled = `<!-- bundleVirtualFS failed: ${msg} -->
[bundle error]`;
  }
  if (bundled.length > EVAL_BUNDLE_MAX_CHARS) {
    bundled = bundled.slice(0, EVAL_BUNDLE_MAX_CHARS) + "\n…[truncated]";
  }
  const fileBlocks = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path2, content]) => truncateBlock(path2, content)).join("\n\n");
  const ctxParts = [];
  if (context?.strategyName) ctxParts.push(`<strategy_name>
${context.strategyName}
</strategy_name>`);
  if (context?.hypothesis) ctxParts.push(`<hypothesis_bet>
${context.hypothesis}
</hypothesis_bet>`);
  if (context?.rationale) ctxParts.push(`<rationale>
${context.rationale}
</rationale>`);
  if (context?.measurements) ctxParts.push(`<measurements_kpis>
${context.measurements}
</measurements_kpis>`);
  if (context?.dimensionValues && Object.keys(context.dimensionValues).length > 0) {
    ctxParts.push(
      `<dimension_values>
${Object.entries(context.dimensionValues).map(([k, v]) => `${k}: ${v}`).join("\n")}
</dimension_values>`
    );
  }
  if (context?.objectivesMetrics) {
    ctxParts.push(`<objectives_metrics>
${context.objectivesMetrics}
</objectives_metrics>`);
  }
  if (context?.designConstraints) {
    ctxParts.push(`<design_constraints>
${context.designConstraints}
</design_constraints>`);
  }
  if (context?.designSystemSnapshot) {
    ctxParts.push(`<design_system>
${context.designSystemSnapshot}
</design_system>`);
  }
  if (context?.outputFormat) {
    ctxParts.push(`<output_format>
${context.outputFormat}
</output_format>`);
  }
  return [
    "<instruction>Evaluate the artifact below. Return ONLY the JSON object specified in your system contract.</instruction>",
    "<compiled_generation_prompt>",
    compiledPrompt.length > EVAL_FILE_MAX_CHARS ? `${compiledPrompt.slice(0, EVAL_FILE_MAX_CHARS)}
…[truncated]` : compiledPrompt,
    "</compiled_generation_prompt>",
    ctxParts.length > 0 ? `<structured_context>
${ctxParts.join("\n\n")}
</structured_context>` : "",
    previewPageUrl ? `<preview_page_url>
${previewPageUrl}
</preview_page_url>` : "",
    "<source_files>",
    fileBlocks,
    "</source_files>",
    "<bundled_preview_html>",
    bundled,
    "</bundled_preview_html>"
  ].filter(Boolean).join("\n\n");
}
const design = 0.4;
const strategy = 0.3;
const implementation = 0.2;
const browser = 0.1;
const rubricWeightsJson = {
  design,
  strategy,
  implementation,
  browser
};
const EVALUATOR_RUBRIC_IDS = ["design", "strategy", "implementation", "browser"];
const RubricWeightsFileSchema = z.object({ design: z.number().min(0), strategy: z.number().min(0), implementation: z.number().min(0), browser: z.number().min(0) }).strict();
const _parsedWeights = RubricWeightsFileSchema.parse(rubricWeightsJson);
const DEFAULT_RUBRIC_WEIGHTS = _parsedWeights;
EVALUATOR_RUBRIC_IDS.length;
const evaluatorRubricIdZodSchema = z.enum(
  EVALUATOR_RUBRIC_IDS
);
const LLM_WAIT_PULSE_MS = 6e3;
const noopUpdater = () => {
};
function runWaitingPulse(logId, t0) {
  const tick = () => {
    const sec = Math.round((performance.now() - t0) / 1e3);
    setLlmCallWaitingStatus(logId, `Waiting for provider… (${sec}s)`);
  };
  const handle2 = setInterval(tick, LLM_WAIT_PULSE_MS);
  tick();
  return () => clearInterval(handle2);
}
function usageLogFields(meta) {
  if (!meta) return {};
  const o = {};
  if (meta.promptTokens != null) o.promptTokens = meta.promptTokens;
  if (meta.completionTokens != null) o.completionTokens = meta.completionTokens;
  if (meta.totalTokens != null) o.totalTokens = meta.totalTokens;
  if (meta.reasoningTokens != null) o.reasoningTokens = meta.reasoningTokens;
  if (meta.cachedPromptTokens != null) o.cachedPromptTokens = meta.cachedPromptTokens;
  if (meta.costCredits != null) o.costCredits = meta.costCredits;
  if (meta.truncated) o.truncated = true;
  return o;
}
async function withLlmCallLifecycle(ctx, model, providerId, systemPrompt, userPrompt, signal, upd, run) {
  const t0 = performance.now();
  const pv = providerLogFields(providerId);
  const logId = beginLlmCall({
    source: ctx.source,
    phase: ctx.phase,
    model,
    ...pv,
    systemPrompt,
    userPrompt,
    response: "Waiting for provider…",
    ...ctx.correlationId ? { correlationId: ctx.correlationId } : {}
  });
  let settled = false;
  const onAbort = () => {
    if (settled) return;
    settled = true;
    failLlmCall(logId, "Aborted", Math.round(performance.now() - t0));
  };
  if (signal?.aborted) {
    onAbort();
    throw new DOMException("Aborted", "AbortError");
  }
  if (signal) signal.addEventListener("abort", onAbort);
  let stopPulse = runWaitingPulse(logId, t0);
  const onFirstStreamBody = () => {
    stopPulse();
    stopPulse = () => {
    };
  };
  try {
    const response = await run({
      logId,
      t0,
      sig: signal,
      onFirstStreamBody
    });
    if (signal) signal.removeEventListener("abort", onAbort);
    if (settled) throw new DOMException("Aborted", "AbortError");
    settled = true;
    finalizeLlmCall(logId, {
      response: response.raw,
      durationMs: Math.round(performance.now() - t0),
      ...usageLogFields(response.metadata)
    });
    return response;
  } catch (err) {
    if (signal) signal.removeEventListener("abort", onAbort);
    if (!settled) {
      settled = true;
      failLlmCall(logId, normalizeError(err), Math.round(performance.now() - t0));
    }
    throw err;
  } finally {
    stopPulse();
  }
}
function chatMessagesToLogFields(messages) {
  const sys = [];
  const usr = [];
  for (const m of messages) {
    const text = typeof m.content === "string" ? m.content : m.content.map((p) => p.type === "text" ? p.text : "[image]").join("\n");
    if (m.role === "system") sys.push(text);
    else if (m.role === "user") usr.push(text);
    else if (m.role === "assistant") usr.push(`[assistant]
${text}`);
  }
  return {
    systemPrompt: sys.join("\n\n") || "(no system message)",
    userPrompt: usr.join("\n\n") || "(no user message)"
  };
}
async function loggedGenerateChat(provider, providerId, messages, options, ctx) {
  const model = options.model ?? "";
  const { systemPrompt, userPrompt } = chatMessagesToLogFields(messages);
  const sig = ctx.signal ?? options.signal;
  const mergedOptions = { ...options, signal: sig };
  return withLlmCallLifecycle(
    ctx,
    model,
    providerId,
    systemPrompt,
    userPrompt,
    sig,
    noopUpdater,
    async () => provider.generateChat(messages, mergedOptions)
  );
}
const playwright = { "consoleErrors": { "score5": 0, "score3": 1, "score2": 2, "bulkPenalty": 4 }, "pageErrorMultiplier": 2, "visibleText": { "excellent": 80, "good": 30, "minimal": 10 }, "bodyLayout": { "minWidthStrong": 100, "minHeightStrong": 40 }, "screenshotJpegQuality": 85 };
const qa = { "interactive": { "score2MinTotal": 1, "score3MinTotal": 3, "score3MinAnchors": 2, "score3MinButtons": 1, "score4MinTotal": 6, "score4MinButtons": 2, "score4MinAnchors": 3, "score4MinNavs": 1, "score5MinTotal": 10, "score5MinButtons": 2, "score5MinForms": 1 }, "content": { "wordsT2": 20, "wordsT3": 60, "wordsT4": 120, "wordsT5": 200, "score3MinHeadings": 1, "score3MinParagraphs": 1, "score4MinHeadings": 2, "score4MinSections": 2, "score5MinHeadings": 2, "score5MinParagraphs": 3, "score5MinSections": 3 } };
const rawScoring = {
  playwright,
  qa
};
const intMin0 = z.number().int().min(0);
const BrowserEvalScoringFileSchema = z.object({
  playwright: z.object({
    consoleErrors: z.object({ score5: intMin0, score3: intMin0, score2: intMin0, bulkPenalty: intMin0 }).strict(),
    pageErrorMultiplier: intMin0,
    visibleText: z.object({ excellent: intMin0, good: intMin0, minimal: intMin0 }).strict(),
    bodyLayout: z.object({ minWidthStrong: intMin0, minHeightStrong: intMin0 }).strict(),
    screenshotJpegQuality: z.number().int().min(1).max(100)
  }).strict(),
  qa: z.object({
    interactive: z.object({
      score2MinTotal: intMin0,
      score3MinTotal: intMin0,
      score3MinAnchors: intMin0,
      score3MinButtons: intMin0,
      score4MinTotal: intMin0,
      score4MinButtons: intMin0,
      score4MinAnchors: intMin0,
      score4MinNavs: intMin0,
      score5MinTotal: intMin0,
      score5MinButtons: intMin0,
      score5MinForms: intMin0
    }).strict(),
    content: z.object({
      wordsT2: intMin0,
      wordsT3: intMin0,
      wordsT4: intMin0,
      wordsT5: intMin0,
      score3MinHeadings: intMin0,
      score3MinParagraphs: intMin0,
      score4MinHeadings: intMin0,
      score4MinSections: intMin0,
      score5MinHeadings: intMin0,
      score5MinParagraphs: intMin0,
      score5MinSections: intMin0
    }).strict()
  }).strict()
}).strict();
const _c = BrowserEvalScoringFileSchema.parse(rawScoring);
const PLAYWRIGHT_CONSOLE_ERRORS_SCORE_5 = _c.playwright.consoleErrors.score5;
const PLAYWRIGHT_CONSOLE_ERRORS_SCORE_3 = _c.playwright.consoleErrors.score3;
const PLAYWRIGHT_CONSOLE_ERRORS_SCORE_2 = _c.playwright.consoleErrors.score2;
const PLAYWRIGHT_CONSOLE_ERROR_BULK_PENALTY = _c.playwright.consoleErrors.bulkPenalty;
const PLAYWRIGHT_PAGE_ERROR_SCORE_MULTIPLIER = _c.playwright.pageErrorMultiplier;
const PLAYWRIGHT_VISIBLE_TEXT_EXCELLENT = _c.playwright.visibleText.excellent;
const PLAYWRIGHT_VISIBLE_TEXT_GOOD = _c.playwright.visibleText.good;
const PLAYWRIGHT_VISIBLE_TEXT_MINIMAL = _c.playwright.visibleText.minimal;
const PLAYWRIGHT_BODY_MIN_WIDTH_STRONG = _c.playwright.bodyLayout.minWidthStrong;
const PLAYWRIGHT_BODY_MIN_HEIGHT_STRONG = _c.playwright.bodyLayout.minHeightStrong;
const PLAYWRIGHT_SCREENSHOT_JPEG_QUALITY = _c.playwright.screenshotJpegQuality;
const QA_INTERACTIVE_SCORE2_MIN_TOTAL = _c.qa.interactive.score2MinTotal;
const QA_INTERACTIVE_SCORE3_MIN_TOTAL = _c.qa.interactive.score3MinTotal;
const QA_INTERACTIVE_SCORE3_MIN_ANCHORS = _c.qa.interactive.score3MinAnchors;
const QA_INTERACTIVE_SCORE3_MIN_BUTTONS = _c.qa.interactive.score3MinButtons;
const QA_INTERACTIVE_SCORE4_MIN_TOTAL = _c.qa.interactive.score4MinTotal;
const QA_INTERACTIVE_SCORE4_MIN_BUTTONS = _c.qa.interactive.score4MinButtons;
const QA_INTERACTIVE_SCORE4_MIN_ANCHORS = _c.qa.interactive.score4MinAnchors;
const QA_INTERACTIVE_SCORE4_MIN_NAVS = _c.qa.interactive.score4MinNavs;
const QA_INTERACTIVE_SCORE5_MIN_TOTAL = _c.qa.interactive.score5MinTotal;
const QA_INTERACTIVE_SCORE5_MIN_BUTTONS = _c.qa.interactive.score5MinButtons;
const QA_INTERACTIVE_SCORE5_MIN_FORMS = _c.qa.interactive.score5MinForms;
const QA_CONTENT_WORDS_T2 = _c.qa.content.wordsT2;
const QA_CONTENT_WORDS_T3 = _c.qa.content.wordsT3;
const QA_CONTENT_WORDS_T4 = _c.qa.content.wordsT4;
const QA_CONTENT_WORDS_T5 = _c.qa.content.wordsT5;
const QA_CONTENT_SCORE3_MIN_HEADINGS = _c.qa.content.score3MinHeadings;
const QA_CONTENT_SCORE3_MIN_PARAGRAPHS = _c.qa.content.score3MinParagraphs;
const QA_CONTENT_SCORE4_MIN_HEADINGS = _c.qa.content.score4MinHeadings;
const QA_CONTENT_SCORE4_MIN_SECTIONS = _c.qa.content.score4MinSections;
const QA_CONTENT_SCORE5_MIN_HEADINGS = _c.qa.content.score5MinHeadings;
const QA_CONTENT_SCORE5_MIN_PARAGRAPHS = _c.qa.content.score5MinParagraphs;
const QA_CONTENT_SCORE5_MIN_SECTIONS = _c.qa.content.score5MinSections;
function hasTag(html, tag) {
  return new RegExp(`<${tag}[\\s>]`, "i").test(html);
}
function countMatches(html, pattern) {
  return (html.match(pattern) ?? []).length;
}
function extractScriptBodies(html) {
  const bodies = [];
  const re = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && m[1].trim()) bodies.push(m[1]);
  }
  return bodies;
}
function extractExternalRefs(html) {
  const refs = [];
  const scriptRe = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    if (m[1]) refs.push({ src: m[1] });
  }
  const linkRe = /<link[^>]+href=["']([^"']+)["'][^>]*>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    if (m[1]) refs.push({ src: m[1] });
  }
  return refs;
}
const INLINE_SCRIPT_VM_TIMEOUT_MS = 2e3;
const MAX_INLINE_SCRIPTS_TO_RUN = 5;
const RUNTIME_ERROR_MSG_MAX_LEN = 200;
const MAX_CONSOLE_ERRORS_IN_REPORT = 3;
function checkPageStructure(html) {
  const issues = [];
  let score = 5;
  if (!/<!\s*DOCTYPE\s+html/i.test(html)) {
    issues.push("missing DOCTYPE");
    score -= 1;
  }
  if (!hasTag(html, "html")) {
    issues.push("no <html> tag");
    score -= 1;
  }
  if (!hasTag(html, "head")) {
    issues.push("no <head> tag");
    score -= 0.5;
  }
  if (!hasTag(html, "body")) {
    issues.push("no <body> tag");
    score -= 1;
  }
  const openTags = countMatches(html, /<[a-z][a-z0-9]*[\s>]/gi);
  const closeTags = countMatches(html, /<\/[a-z][a-z0-9]*>/gi);
  const imbalance = Math.abs(openTags - closeTags);
  if (imbalance > openTags * 0.3) {
    issues.push(`tag imbalance: ${openTags} open vs ${closeTags} close`);
    score -= 1;
  }
  return {
    score: Math.max(1, Math.round(score)),
    notes: issues.length > 0 ? issues.join("; ") : "HTML structure looks well-formed"
  };
}
function checkAssetIntegrity(html, files, htmlFilePath) {
  const refs = extractExternalRefs(html);
  if (refs.length === 0) {
    return { score: 5, notes: "No external asset references (all inlined)" };
  }
  const missing = [];
  const fileKeys = new Set(Object.keys(files));
  for (const ref of refs) {
    const raw = ref.src.trim();
    if (/^(https?:)/i.test(raw) || raw.startsWith("//")) continue;
    const resolved = resolveVirtualAssetPath(ref.src, htmlFilePath);
    if (resolved === void 0) continue;
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
    notes: `Missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` (+ ${missing.length - 3} more)` : ""}`
  };
}
function createDomElementStub() {
  const stub = {
    addEventListener: () => {
    },
    removeEventListener: () => {
    },
    dispatchEvent: () => true,
    setAttribute: () => {
    },
    getAttribute: () => null,
    hasAttribute: () => false,
    appendChild: (n) => n,
    removeChild: () => {
    },
    insertBefore: (n) => n,
    style: {},
    textContent: "",
    innerHTML: "",
    innerText: "",
    focus: () => {
    },
    blur: () => {
    },
    click: () => {
    },
    matches: () => false,
    closest: () => null,
    parentElement: null,
    parentNode: null,
    children: [],
    childNodes: [],
    nextElementSibling: null,
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 })
  };
  stub.querySelector = () => createDomElementStub();
  stub.querySelectorAll = () => createEmptyNodeList();
  stub.getElementById = () => createDomElementStub();
  return stub;
}
function createEmptyNodeList() {
  return {
    length: 0,
    forEach() {
    },
    item: () => null,
    *[Symbol.iterator]() {
    }
  };
}
function createBrowserQaSandboxDocument() {
  const elStub = createDomElementStub();
  const bodyStub = createDomElementStub();
  const headStub = createDomElementStub();
  const noop = () => {
  };
  const documentMock = {
    addEventListener(type, fn) {
      if (type === "DOMContentLoaded" && typeof fn === "function") {
        try {
          fn();
        } catch {
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
    documentElement: elStub
  };
  return documentMock;
}
function checkJsRuntime(html) {
  const scripts = extractScriptBodies(html);
  if (scripts.length === 0) {
    return { score: 5, notes: "No inline scripts to execute", errors: [] };
  }
  const consoleErrors = [];
  const runtimeErrors = [];
  const documentMock = createBrowserQaSandboxDocument();
  const fireMaybe = (fn) => {
    if (typeof fn === "function") {
      try {
        fn();
      } catch {
      }
    }
  };
  const sandbox2 = createContext({
    document: documentMock,
    /** Global/window listeners (global object === window after self-reference below). */
    addEventListener(type, fn) {
      if (type === "load") fireMaybe(fn);
    },
    removeEventListener: () => {
    },
    navigator: { userAgent: "node-browser-qa" },
    location: { href: "about:blank", protocol: "http:", hostname: "localhost" },
    history: { pushState: () => {
    }, replaceState: () => {
    } },
    setTimeout: () => 0,
    setInterval: () => 0,
    clearTimeout: () => {
    },
    clearInterval: () => {
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {
    },
    fetch: () => Promise.reject(new Error("fetch not available in QA sandbox")),
    console: {
      log: () => {
      },
      info: () => {
      },
      debug: () => {
      },
      warn: () => {
      },
      error: (...args) => {
        consoleErrors.push(args.map(String).join(" "));
      }
    },
    URL: typeof URL !== "undefined" ? URL : void 0,
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
    undefined: void 0,
    NaN: NaN,
    Infinity: Infinity,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent
  });
  sandbox2.window = sandbox2;
  sandbox2.self = sandbox2;
  sandbox2.globalThis = sandbox2;
  let scriptScore = 5;
  for (const src of scripts.slice(0, MAX_INLINE_SCRIPTS_TO_RUN)) {
    try {
      new Script(src).runInContext(sandbox2, { timeout: INLINE_SCRIPT_VM_TIMEOUT_MS });
    } catch (err) {
      const msg = normalizeError(err);
      if (msg.includes("fetch not available") || msg.includes("is not a constructor") || msg.includes("CustomEvent") || msg.includes("ResizeObserver") || msg.includes("MutationObserver") || msg.includes("IntersectionObserver") || msg.includes("cancelAnimationFrame")) {
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
    errors: allErrors
  };
}
function checkInteractiveElements(html) {
  const buttons = countMatches(html, /<button[\s>]/gi);
  const anchors = countMatches(html, /<a[\s>]/gi);
  const inputs = countMatches(html, /<input[\s>]/gi);
  const forms = countMatches(html, /<form[\s>]/gi);
  const onclicks = countMatches(html, /onclick=/gi);
  const total = buttons + anchors + inputs + forms + onclicks;
  const navs = countMatches(html, /<nav[\s>]/gi);
  let score = 1;
  if (total >= QA_INTERACTIVE_SCORE2_MIN_TOTAL) score = 2;
  if (total >= QA_INTERACTIVE_SCORE3_MIN_TOTAL || anchors >= QA_INTERACTIVE_SCORE3_MIN_ANCHORS && buttons >= QA_INTERACTIVE_SCORE3_MIN_BUTTONS) {
    score = 3;
  }
  if (total >= QA_INTERACTIVE_SCORE4_MIN_TOTAL || buttons >= QA_INTERACTIVE_SCORE4_MIN_BUTTONS && (anchors >= QA_INTERACTIVE_SCORE4_MIN_ANCHORS || navs >= QA_INTERACTIVE_SCORE4_MIN_NAVS)) {
    score = 4;
  }
  if (total >= QA_INTERACTIVE_SCORE5_MIN_TOTAL && (buttons >= QA_INTERACTIVE_SCORE5_MIN_BUTTONS || forms >= QA_INTERACTIVE_SCORE5_MIN_FORMS)) {
    score = 5;
  }
  const parts = [];
  if (buttons > 0) parts.push(`${buttons} button(s)`);
  if (anchors > 0) parts.push(`${anchors} link(s)`);
  if (inputs > 0) parts.push(`${inputs} input(s)`);
  if (forms > 0) parts.push(`${forms} form(s)`);
  if (navs > 0) parts.push(`${navs} nav region(s)`);
  return {
    score,
    notes: parts.length > 0 ? parts.join(", ") : "No interactive elements found"
  };
}
function checkContentPresence(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch?.[1] ?? html;
  const stripped = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = stripped ? stripped.split(/\s+/).filter((w) => w.length > 2).length : 0;
  const headings = countMatches(html, /<h[1-6][\s>]/gi);
  const paragraphs = countMatches(html, /<p[\s>]/gi);
  const sections = countMatches(html, /<(section|article|main|header|footer)[\s>]/gi);
  let score = 1;
  if (wordCount >= QA_CONTENT_WORDS_T2) score = 2;
  if (wordCount >= QA_CONTENT_WORDS_T3 || headings >= QA_CONTENT_SCORE3_MIN_HEADINGS && paragraphs >= QA_CONTENT_SCORE3_MIN_PARAGRAPHS) {
    score = 3;
  }
  if (wordCount >= QA_CONTENT_WORDS_T4 && (headings >= QA_CONTENT_SCORE4_MIN_HEADINGS || sections >= QA_CONTENT_SCORE4_MIN_SECTIONS)) {
    score = 4;
  }
  if (wordCount >= QA_CONTENT_WORDS_T5 && headings >= QA_CONTENT_SCORE5_MIN_HEADINGS && (paragraphs >= QA_CONTENT_SCORE5_MIN_PARAGRAPHS || sections >= QA_CONTENT_SCORE5_MIN_SECTIONS)) {
    score = 5;
  }
  return {
    score,
    notes: `≈${wordCount} words, ${headings} heading(s), ${paragraphs} paragraph(s), ${sections} section(s)`
  };
}
function runBrowserQA(input) {
  let bundledHtml;
  try {
    bundledHtml = bundleVirtualFS(input.files);
  } catch {
    bundledHtml = Object.values(input.files).find((v) => /<html/i.test(v)) ?? "";
  }
  const htmlPaths = Object.keys(input.files).filter((k) => k.endsWith(".html"));
  const entryKey = resolvePreviewEntryPath(input.files);
  const entryHtml = input.files[entryKey] ?? bundledHtml;
  const scores = {};
  const findings = [];
  const hardFails = [];
  const structure = checkPageStructure(entryHtml);
  scores.page_structure = structure;
  if (structure.score <= 2) {
    findings.push({ severity: "high", summary: "Malformed HTML structure", detail: structure.notes });
  }
  let assets = checkAssetIntegrity(bundledHtml, input.files, entryKey);
  for (const p of htmlPaths) {
    const a = checkAssetIntegrity(input.files[p], input.files, p);
    if (a.score < assets.score) assets = a;
  }
  scores.asset_integrity = assets;
  if (assets.score < 5) {
    findings.push({ severity: "high", summary: "Missing asset references", detail: assets.notes });
    if (assets.score <= 2) {
      hardFails.push({ code: "missing_assets", message: assets.notes });
    }
  }
  const runtime2 = checkJsRuntime(bundledHtml);
  scores.js_runtime = { score: runtime2.score, notes: runtime2.notes };
  if (runtime2.errors.length > 0) {
    for (const err of runtime2.errors.slice(0, 3)) {
      findings.push({
        severity: runtime2.score <= 2 ? "high" : "medium",
        summary: "JS runtime error",
        detail: err
      });
    }
    if (runtime2.score <= 1) {
      hardFails.push({ code: "js_execution_failure", message: runtime2.errors[0] ?? "script failed" });
    }
  }
  let interactive = checkInteractiveElements(bundledHtml);
  for (const p of htmlPaths) {
    const i = checkInteractiveElements(input.files[p]);
    if (i.score > interactive.score) interactive = i;
  }
  scores.interactive_elems = interactive;
  if (interactive.score <= 1) {
    findings.push({ severity: "medium", summary: "No interactive elements found", detail: interactive.notes });
  }
  let content = checkContentPresence(bundledHtml);
  for (const p of htmlPaths) {
    const c = checkContentPresence(input.files[p]);
    if (c.score > content.score) content = c;
  }
  scores.content_presence = content;
  if (content.score <= 1) {
    findings.push({ severity: "high", summary: "Page appears empty or minimal", detail: content.notes });
    hardFails.push({ code: "empty_page", message: content.notes });
  }
  return { rubric: "browser", scores, findings, hardFails };
}
const playwrightDomMetricsSchema = z.object({
  textLen: z.number(),
  bodyW: z.number(),
  bodyH: z.number(),
  brokenImages: z.number()
});
const PLAYWRIGHT_EVAL_SCRIPT = `(() => {
  const body = document.body;
  const text = (body?.innerText ?? '').trim();
  const rect = body?.getBoundingClientRect();
  const imgs = Array.from(document.images);
  const broken = imgs.filter((i) => i.naturalWidth === 0 && i.naturalHeight === 0).length;
  return {
    textLen: text.length,
    bodyW: rect ? rect.width : 0,
    bodyH: rect ? rect.height : 0,
    brokenImages: broken,
  };
})()`;
function parsePlaywrightDomMetrics(raw) {
  const r = playwrightDomMetricsSchema.safeParse(raw);
  if (r.success) return r.data;
  return { textLen: 0, bodyW: 0, bodyH: 0, brokenImages: 0 };
}
function scoreVisibleTextLength(textLen) {
  if (textLen >= PLAYWRIGHT_VISIBLE_TEXT_EXCELLENT) return 5;
  if (textLen >= PLAYWRIGHT_VISIBLE_TEXT_GOOD) return 3;
  if (textLen >= PLAYWRIGHT_VISIBLE_TEXT_MINIMAL) return 2;
  return 1;
}
function scoreBodyLayout(bodyW, bodyH) {
  if (bodyW > PLAYWRIGHT_BODY_MIN_WIDTH_STRONG && bodyH > PLAYWRIGHT_BODY_MIN_HEIGHT_STRONG) return 5;
  if (bodyW > 0 && bodyH > 0) return 3;
  return 1;
}
function scorePlaywrightConsoleErrors(errorCount) {
  if (errorCount === PLAYWRIGHT_CONSOLE_ERRORS_SCORE_5) return 5;
  if (errorCount === PLAYWRIGHT_CONSOLE_ERRORS_SCORE_3) return 3;
  if (errorCount === PLAYWRIGHT_CONSOLE_ERRORS_SCORE_2) return 2;
  return Math.max(1, 5 - PLAYWRIGHT_CONSOLE_ERROR_BULK_PENALTY);
}
const SCREENSHOT_MAX_BASE64 = 6e5;
const FONTS_READY_TIMEOUT_MS = 8e3;
const NETWORK_IDLE_AFTER_SET_CONTENT_MS = 1e4;
function skipReport(reason, message) {
  return {
    rubric: "browser",
    scores: {},
    findings: [],
    hardFails: [],
    playwrightSkipped: { reason, message: message.slice(0, 800) }
  };
}
async function settlePageForEval(page) {
  await page.evaluate(
    `(() => Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, ${FONTS_READY_TIMEOUT_MS})),
      ]))()`
  ).catch((err) => {
    console.warn("[playwright-eval] document.fonts.ready", normalizeError(err));
  });
  await page.waitForFunction(`() => (document.body?.innerText ?? '').trim().length >= 10`, {
    timeout: 4500
  }).catch((err) => {
    console.warn("[playwright-eval] settlePageForEval: minimal text timeout", normalizeError(err));
  });
  await page.evaluate(`(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }))()`);
}
async function loadPageForScreenshot(page, bundled, previewPageUrl) {
  if (previewPageUrl) {
    await page.goto(previewPageUrl, { waitUntil: "networkidle", timeout: 25e3 });
  } else {
    await page.setContent(bundled, { waitUntil: "load", timeout: 2e4 });
    await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_AFTER_SET_CONTENT_MS }).catch(() => {
    });
  }
}
async function runBrowserPlaywrightEval(input) {
  let bundled;
  if (input.previewPageUrl) {
    bundled = "<html><body></body></html>";
  } else {
    try {
      bundled = bundleVirtualFS(input.files);
    } catch (err) {
      console.warn(
        "[playwright-eval] bundleVirtualFS failed; using fallback HTML slice",
        normalizeError(err)
      );
      bundled = Object.values(input.files).find((v) => /<html/i.test(v)) ?? "<html><body></body></html>";
    }
  }
  const pageErrors = [];
  const consoleErrors = [];
  let browser2;
  try {
    browser2 = await chromium.launch({ headless: true });
  } catch (err) {
    return skipReport("browser_unavailable", `Chromium launch failed: ${normalizeError(err)}`);
  }
  try {
    const page = await browser2.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await loadPageForScreenshot(page, bundled, input.previewPageUrl);
    await settlePageForEval(page);
    const metrics = parsePlaywrightDomMetrics(await page.evaluate(PLAYWRIGHT_EVAL_SCRIPT));
    let artifacts;
    try {
      const buf = await page.screenshot({
        type: "jpeg",
        quality: PLAYWRIGHT_SCREENSHOT_JPEG_QUALITY,
        fullPage: false
      });
      const base64 = buf.toString("base64");
      if (base64.length <= SCREENSHOT_MAX_BASE64) {
        artifacts = {
          browserScreenshot: { mediaType: "image/jpeg", base64 }
        };
      }
    } catch {
    }
    const scores = {
      playwright_render: {
        score: pageErrors.length === 0 ? 5 : Math.max(1, 5 - pageErrors.length * PLAYWRIGHT_PAGE_ERROR_SCORE_MULTIPLIER),
        notes: pageErrors.length === 0 ? "Page loaded without uncaught exceptions" : pageErrors.slice(0, 2).join("; ")
      },
      playwright_console: {
        score: scorePlaywrightConsoleErrors(consoleErrors.length),
        notes: consoleErrors.length === 0 ? "No console errors" : consoleErrors.slice(0, 3).join("; ")
      },
      playwright_visible_text: {
        score: scoreVisibleTextLength(metrics.textLen),
        notes: `Visible text length ≈ ${metrics.textLen} chars`
      },
      playwright_layout: {
        score: scoreBodyLayout(metrics.bodyW, metrics.bodyH),
        notes: `Body box ${Math.round(metrics.bodyW)}×${Math.round(metrics.bodyH)}`
      },
      playwright_images: {
        score: metrics.brokenImages === 0 ? 5 : Math.max(1, 5 - metrics.brokenImages * PLAYWRIGHT_PAGE_ERROR_SCORE_MULTIPLIER),
        notes: metrics.brokenImages === 0 ? "No broken images detected" : `${metrics.brokenImages} image(s) appear broken (0×0)`
      }
    };
    const findings = [];
    const hardFails = [];
    if (pageErrors.length > 0) {
      findings.push({
        severity: "high",
        summary: "Uncaught page errors in headless browser",
        detail: pageErrors[0] ?? ""
      });
      hardFails.push({
        code: "playwright_page_error",
        message: (pageErrors[0] ?? "page error").slice(0, 400)
      });
    }
    if (metrics.textLen < 1) {
      hardFails.push({
        code: "playwright_empty_visible",
        message: "Rendered page has no visible text"
      });
    } else if (metrics.textLen < 10) {
      findings.push({
        severity: "medium",
        summary: "Very little visible text after load",
        detail: `innerText length ≈ ${metrics.textLen} (may be slow hydration or sparse UI)`
      });
    }
    return { rubric: "browser", scores, findings, hardFails, artifacts };
  } catch (err) {
    return skipReport("eval_error", normalizeError(err));
  } finally {
    await browser2.close().catch(() => {
    });
  }
}
function mergeBrowserEvalReports(preflight, playwright2) {
  return {
    rubric: "browser",
    scores: { ...preflight.scores, ...playwright2.scores },
    findings: [...preflight.findings, ...playwright2.findings],
    hardFails: [...preflight.hardFails, ...playwright2.hardFails],
    artifacts: playwright2.artifacts ?? preflight.artifacts
  };
}
function mergePreflightWithPlaywright(preflight, playwright2) {
  if (playwright2.playwrightSkipped) {
    const summary = playwright2.playwrightSkipped.reason === "browser_unavailable" ? "Headless browser unavailable — VM preflight only" : "Headless browser eval failed — VM preflight only";
    return {
      ...preflight,
      findings: [
        ...preflight.findings,
        {
          severity: "medium",
          summary,
          detail: playwright2.playwrightSkipped.message
        }
      ]
    };
  }
  return mergeBrowserEvalReports(preflight, playwright2);
}
const DEFAULT_TTL_MS = 30 * 60 * 1e3;
class InMemoryPreviewSessionStore {
  store = /* @__PURE__ */ new Map();
  create(files, ttlMs = DEFAULT_TTL_MS) {
    ensurePruneLoop();
    this.prune();
    this.evictOldestSessionIfAtCap();
    const id = crypto.randomUUID();
    const now2 = Date.now();
    this.store.set(id, { files: { ...files }, expiresAt: now2 + ttlMs, createdAt: now2 });
    return id;
  }
  replace(id, files, ttlMs = DEFAULT_TTL_MS) {
    this.prune();
    const row = this.store.get(id);
    if (!row || row.expiresAt <= Date.now()) return false;
    row.files = { ...files };
    row.expiresAt = Date.now() + ttlMs;
    return true;
  }
  delete(id) {
    this.store.delete(id);
  }
  snapshot(id) {
    this.prune();
    const row = this.store.get(id);
    if (!row || row.expiresAt <= Date.now()) return void 0;
    return { ...row.files };
  }
  file(id, rawPath) {
    this.prune();
    const row = this.store.get(id);
    if (!row || row.expiresAt <= Date.now()) return void 0;
    const normalized = normalizeVirtualPath(rawPath);
    if (normalized === "") return void 0;
    const direct = row.files[normalized];
    if (direct !== void 0) return direct;
    const withDot = `./${normalized}`;
    const alt = row.files[withDot];
    if (alt !== void 0) return alt;
    const unslash = normalized.replace(/^\//, "");
    if (unslash !== normalized) {
      const v = row.files[unslash];
      if (v !== void 0) return v;
    }
    return void 0;
  }
  clear() {
    this.store.clear();
  }
  evictOldestSessionIfAtCap() {
    const cap = env.MAX_PREVIEW_SESSIONS;
    if (this.store.size < cap) return;
    let oldestId = null;
    let oldestCreated = Infinity;
    for (const [id, row] of this.store) {
      if (row.createdAt < oldestCreated) {
        oldestCreated = row.createdAt;
        oldestId = id;
      }
    }
    if (oldestId != null) this.store.delete(oldestId);
  }
  prune() {
    const now2 = Date.now();
    for (const [id, row] of this.store) {
      if (row.expiresAt <= now2) this.store.delete(id);
    }
  }
}
let previewStore = new InMemoryPreviewSessionStore();
let pruneInterval = null;
function ensurePruneLoop() {
  if (pruneInterval != null) return;
  if (process.env.VITEST === "true") return;
  pruneInterval = setInterval(() => {
    try {
      previewStore.snapshot("__prune__");
    } catch {
    }
  }, 6e4);
  if (typeof pruneInterval.unref === "function") pruneInterval.unref();
}
function createPreviewSession(files, ttlMs = DEFAULT_TTL_MS) {
  return previewStore.create(files, ttlMs);
}
function replacePreviewSessionFiles(id, files, ttlMs = DEFAULT_TTL_MS) {
  return previewStore.replace(id, files, ttlMs);
}
function deletePreviewSession(id) {
  previewStore.delete(id);
}
function getPreviewSessionSnapshot(id) {
  return previewStore.snapshot(id);
}
function getPreviewSessionFile(id, rawPath) {
  return previewStore.file(id, rawPath);
}
function normalizeVirtualPath(raw) {
  const trimmed = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = trimmed.split("/").filter((s) => s.length > 0 && s !== ".");
  const out = [];
  for (const seg of segments) {
    if (seg === "..") {
      if (out.length === 0) return "";
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}
const criterionSchema = z.object({
  score: z.number(),
  notes: z.string()
});
const browserScreenshotArtifactSchema = z.object({
  mediaType: z.enum(["image/jpeg", "image/png"]),
  base64: z.string()
});
const evaluatorWorkerReportSchema = z.object({
  rubric: evaluatorRubricIdZodSchema,
  scores: z.record(z.string(), criterionSchema),
  findings: z.array(
    z.object({
      severity: z.enum(["high", "medium", "low"]),
      summary: z.string(),
      detail: z.string()
    })
  ),
  hardFails: z.array(
    z.object({
      code: z.string(),
      message: z.string()
    })
  ),
  playwrightSkipped: z.object({
    reason: z.enum(["browser_unavailable", "eval_error"]),
    message: z.string()
  }).optional(),
  artifacts: z.object({
    browserScreenshot: browserScreenshotArtifactSchema.optional()
  }).optional()
});
function coerceToArray(v, isSingleItem) {
  if (v === void 0 || v === null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "object") {
    const o = v;
    if (isSingleItem(o)) return [v];
    return Object.values(o);
  }
  return [];
}
function coerceFindingLikeArray(v) {
  return coerceToArray(
    v,
    (o) => typeof o.severity === "string" && typeof o.summary === "string" && typeof o.detail === "string"
  );
}
function coerceHardFailLikeArray(v) {
  return coerceToArray(v, (o) => typeof o.code === "string" && typeof o.message === "string");
}
function normalizeEvaluatorWorkerPayload(parsed) {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }
  const root = { ...parsed };
  const scoresRaw = root.scores;
  if (scoresRaw !== null && typeof scoresRaw === "object" && !Array.isArray(scoresRaw)) {
    const scores = { ...scoresRaw };
    let mutated = false;
    if ("findings" in scores) {
      const nested = scores.findings;
      const hoisted = Array.isArray(nested) ? nested : coerceFindingLikeArray(nested);
      delete scores.findings;
      mutated = true;
      const top = coerceFindingLikeArray(root.findings);
      root.findings = [...top, ...hoisted];
    }
    if ("hardFails" in scores) {
      const nested = scores.hardFails;
      const hoisted = Array.isArray(nested) ? nested : coerceHardFailLikeArray(nested);
      delete scores.hardFails;
      mutated = true;
      const top = coerceHardFailLikeArray(root.hardFails);
      root.hardFails = [...top, ...hoisted];
    }
    if (mutated) root.scores = scores;
  }
  root.findings = coerceFindingLikeArray(root.findings);
  root.hardFails = coerceHardFailLikeArray(root.hardFails);
  return root;
}
function parseModelJsonObject(raw, schema, normalize) {
  const jsonStr = extractLlmJsonObjectSegment(raw, {
    requireObject: true,
    emptyMessage: "Evaluator model returned no JSON object"
  });
  let parsed = parseJsonLenient(jsonStr);
  if (normalize) parsed = normalize(parsed);
  return schema.parse(parsed);
}
const EVAL_DEGRADED_LOG_MAX = 400;
function buildDegradedReport(rubric, error) {
  const message = normalizeError(error);
  const logBody = message.length > EVAL_DEGRADED_LOG_MAX ? `${message.slice(0, EVAL_DEGRADED_LOG_MAX)}…` : message;
  console.warn("[eval:worker-degraded]", { rubric, message: logBody });
  return {
    rubric,
    scores: {
      evaluator_unavailable: { score: 0, notes: `Worker failed: ${message}` }
    },
    findings: [
      {
        severity: "high",
        summary: "Evaluator worker failed",
        detail: message
      }
    ],
    hardFails: [
      {
        code: "evaluator_worker_error",
        message: message.slice(0, EVAL_DEGRADED_MSG_MAX)
      }
    ]
  };
}
async function runOneEvaluator(rubric, systemPrompt, userContent, providerId, modelId, logCtx) {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  const evaluatorThinking = resolveThinkingConfig("evaluator", modelId);
  const response = await loggedGenerateChat(
    provider,
    providerId,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    { model: modelId, signal: logCtx.signal, thinking: evaluatorThinking },
    {
      source: "evaluator",
      phase: `Rubric: ${rubric}`,
      ...logCtx.correlationId ? { correlationId: `${logCtx.correlationId}:eval:${rubric}` } : {}
    }
  );
  const parsed = parseModelJsonObject(response.raw, evaluatorWorkerReportSchema, normalizeEvaluatorWorkerPayload);
  return { ...parsed, rawTrace: response.raw };
}
async function runEvaluatorWorker(rubric, systemPrompt, userContent, providerId, modelId, logCtx) {
  try {
    const report = await runOneEvaluator(
      rubric,
      systemPrompt,
      userContent,
      providerId,
      modelId,
      logCtx
    );
    if (report.rubric !== rubric) {
      return buildDegradedReport(
        rubric,
        new Error(`Rubric mismatch: expected ${rubric}, got ${report.rubric}`)
      );
    }
    return report;
  } catch (err) {
    return buildDegradedReport(rubric, err);
  }
}
async function runEvaluationWorkers(input) {
  const evalProviderId = input.evaluatorProviderId ?? input.providerId;
  const evalModelId = input.evaluatorModelId ?? input.modelId;
  const previewSessionId = createPreviewSession(input.files);
  const previewPageUrl = `${env.previewPublicBaseUrl}/api/preview/sessions/${previewSessionId}/${encodeVirtualPathForUrl(resolvePreviewEntryPath(input.files))}`;
  try {
    const userContent = buildEvaluatorUserContent(
      input.files,
      input.compiledPrompt,
      input.context,
      previewPageUrl
    );
    const [sysDesign, sysStrategy, sysImpl] = await Promise.all([
      getPromptBody("evaluator-design-quality"),
      getPromptBody("evaluator-strategy-fidelity"),
      getPromptBody("evaluator-implementation")
    ]);
    const evalLogCtx = {
      correlationId: input.correlationId,
      signal: input.signal
    };
    const runDesign = () => runEvaluatorWorker("design", sysDesign, userContent, evalProviderId, evalModelId, evalLogCtx);
    const runStrategy = () => runEvaluatorWorker("strategy", sysStrategy, userContent, evalProviderId, evalModelId, evalLogCtx);
    const runImpl = () => runEvaluatorWorker(
      "implementation",
      sysImpl,
      userContent,
      evalProviderId,
      evalModelId,
      evalLogCtx
    );
    const runBrowser = async () => {
      try {
        const preflight = runBrowserQA({ files: input.files });
        if (!env.BROWSER_PLAYWRIGHT_EVAL) {
          return preflight;
        }
        const pw = await runBrowserPlaywrightEval({ files: input.files, previewPageUrl });
        return mergePreflightWithPlaywright(preflight, pw);
      } catch (err) {
        return buildDegradedReport("browser", err);
      }
    };
    const rubricJobs = [
      { rubric: "design", run: runDesign },
      { rubric: "strategy", run: runStrategy },
      { rubric: "implementation", run: runImpl },
      { rubric: "browser", run: runBrowser }
    ];
    const emitDone = (rubric, report) => {
      input.onWorkerDone?.(rubric, report);
      return report;
    };
    const runWorker = (job) => job.run().then(
      (report) => emitDone(job.rubric, report),
      (reason) => emitDone(job.rubric, buildDegradedReport(job.rubric, reason))
    );
    if (input.parallel) {
      const [design22, strategy22, implementation22, browser22] = await Promise.all(rubricJobs.map(runWorker));
      return { design: design22, strategy: strategy22, implementation: implementation22, browser: browser22 };
    }
    const [design2, strategy2, implementation2, browser2] = [
      await runWorker(rubricJobs[0]),
      await runWorker(rubricJobs[1]),
      await runWorker(rubricJobs[2]),
      await runWorker(rubricJobs[3])
    ];
    return { design: design2, strategy: strategy2, implementation: implementation2, browser: browser2 };
  } finally {
    deletePreviewSession(previewSessionId);
  }
}
const revisionGate = { "criticalScoreMax": 2, "implCriticalScoreMax": 1, "lowAverageThreshold": 3.5 };
const maxRevisionRoundsCap = 20;
const rawThresholds = {
  revisionGate,
  maxRevisionRoundsCap
};
const EvaluationThresholdsFileSchema = z.object({
  revisionGate: z.object({
    criticalScoreMax: z.number().int().min(0),
    implCriticalScoreMax: z.number().int().min(0),
    lowAverageThreshold: z.number().min(0)
  }).strict(),
  maxRevisionRoundsCap: z.number().int().min(1)
}).strict();
const _thresholds = EvaluationThresholdsFileSchema.parse(rawThresholds);
const DESIGN_STRATEGY_RUBRICS = /* @__PURE__ */ new Set(["design", "strategy"]);
const IMPL_BROWSER_RUBRICS = /* @__PURE__ */ new Set(["implementation", "browser"]);
const RUBRIC_WEIGHTS = { ...DEFAULT_RUBRIC_WEIGHTS };
function resolveRubricWeights(override) {
  if (!override || Object.keys(override).length === 0) {
    return { ...RUBRIC_WEIGHTS };
  }
  const out = { ...RUBRIC_WEIGHTS };
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const v = override[rid];
    if (v != null && Number.isFinite(v) && v >= 0) {
      out[rid] = v;
    }
  }
  const sum = EVALUATOR_RUBRIC_IDS.reduce((acc, rid) => acc + out[rid], 0);
  if (sum <= 0) return { ...RUBRIC_WEIGHTS };
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    out[rid] = out[rid] / sum;
  }
  return out;
}
const REVISION_GATE_CRITICAL_SCORE_MAX = _thresholds.revisionGate.criticalScoreMax;
const REVISION_GATE_IMPL_CRITICAL_SCORE_MAX = _thresholds.revisionGate.implCriticalScoreMax;
const REVISION_GATE_LOW_AVERAGE_THRESHOLD = _thresholds.revisionGate.lowAverageThreshold;
const MAX_REVISION_ROUNDS_CAP = _thresholds.maxRevisionRoundsCap;
function rubricFromNormalizedScoreKey(key) {
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const prefix = `${rid}_`;
    if (key.startsWith(prefix)) return rid;
  }
  return null;
}
function tieredAnyCriticalNormalizedScores(normalizedScores) {
  for (const [key, score] of Object.entries(normalizedScores)) {
    const r = rubricFromNormalizedScoreKey(key);
    if (!r) continue;
    if (DESIGN_STRATEGY_RUBRICS.has(r) && score <= REVISION_GATE_CRITICAL_SCORE_MAX) return true;
    if (IMPL_BROWSER_RUBRICS.has(r) && score <= REVISION_GATE_IMPL_CRITICAL_SCORE_MAX) return true;
  }
  return false;
}
function meanRubricScores(scores) {
  const vals = Object.values(scores).map((s) => s.score);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
function computeWeightedOverallFromRubricMeans(means, weights = RUBRIC_WEIGHTS) {
  let sum = 0;
  let w = 0;
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const m = means[rid];
    if (m === void 0 || !Number.isFinite(m)) continue;
    const wt = weights[rid];
    if (!Number.isFinite(wt) || wt <= 0) continue;
    sum += wt * m;
    w += wt;
  }
  if (w <= 0) return 0;
  return sum / w;
}
function rubricMeansFromNormalizedScores(normalizedScores) {
  const out = {};
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const prefix = `${rid}_`;
    const vals = Object.entries(normalizedScores).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
    if (vals.length > 0) {
      out[rid] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }
  return out;
}
const SEVERITY_RANK = {
  high: 0,
  medium: 1,
  low: 2
};
const FINDING_SOURCE_PRIORITY = {
  design: 0,
  strategy: 1,
  implementation: 2,
  browser: 3
};
function aggregateEvaluationReports(reports, rubricWeightOverride) {
  const normalizedScores = {};
  const rubricMeans = {};
  for (const rubric of EVALUATOR_RUBRIC_IDS) {
    rubricMeans[rubric] = meanRubricScores(reports[rubric].scores);
    for (const [criterion, { score }] of Object.entries(reports[rubric].scores)) {
      const key = `${rubric}_${criterion}`;
      normalizedScores[key] = score;
    }
  }
  const weights = resolveRubricWeights(rubricWeightOverride);
  const overallScore = computeWeightedOverallFromRubricMeans(rubricMeans, weights);
  const evaluatorTraces = {};
  for (const rubric of ["design", "strategy", "implementation"]) {
    const t = reports[rubric].rawTrace;
    if (t != null && t.length > 0) evaluatorTraces[rubric] = t;
  }
  const hardFails = [];
  for (const rubric of EVALUATOR_RUBRIC_IDS) {
    for (const hf of reports[rubric].hardFails) {
      hardFails.push({ ...hf, source: rubric });
    }
  }
  const allFindings = [];
  for (const rubric of EVALUATOR_RUBRIC_IDS) {
    for (const f of reports[rubric].findings) {
      allFindings.push({ ...f, source: rubric });
    }
  }
  allFindings.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    return FINDING_SOURCE_PRIORITY[a.source] - FINDING_SOURCE_PRIORITY[b.source];
  });
  const seenSummaries = /* @__PURE__ */ new Set();
  const findingFixes = [];
  for (const f of allFindings) {
    if (seenSummaries.has(f.summary)) continue;
    seenSummaries.add(f.summary);
    findingFixes.push(`[${f.severity}] ${f.summary}: ${f.detail}`);
  }
  const hardFailFixes = hardFails.map((hf) => `[hard_fail:${hf.code}] ${hf.message}`);
  const prioritizedFixes = [...hardFailFixes, ...findingFixes];
  let revisionBrief = "## Prioritized remediation\n\n";
  if (prioritizedFixes.length === 0) {
    revisionBrief += "- No specific findings; review normalized scores for weak dimensions.\n";
  } else {
    for (const fix of prioritizedFixes) {
      revisionBrief += `- ${fix}
`;
    }
  }
  return {
    overallScore,
    normalizedScores,
    hardFails,
    prioritizedFixes,
    /**
     * Always `false` here — revision is driven only by {@link enforceRevisionGate} rules
     * (hard fails, tiered critical scores, low weighted average), not by LLM `shouldRevise`.
     * @see isEvalSatisfied — with no `minOverallScore`, stopping uses `!aggregate.shouldRevise` after the gate.
     */
    shouldRevise: false,
    revisionBrief,
    evaluatorTraces: Object.keys(evaluatorTraces).length > 0 ? evaluatorTraces : void 0
  };
}
function isEvalSatisfied(aggregate, opts) {
  if (aggregate.hardFails.length > 0) return false;
  const threshold = opts?.minOverallScore;
  if (threshold != null && Number.isFinite(threshold)) {
    return Number.isFinite(aggregate.overallScore) && aggregate.overallScore >= threshold;
  }
  return !aggregate.shouldRevise;
}
function enforceRevisionGate(report) {
  const anyCritical = tieredAnyCriticalNormalizedScores(report.normalizedScores);
  const hasHardFails = report.hardFails.length > 0;
  const weighted = Number.isFinite(report.overallScore) ? report.overallScore : 0;
  const lowAverage = weighted < REVISION_GATE_LOW_AVERAGE_THRESHOLD;
  const shouldRevise = report.shouldRevise || hasHardFails || anyCritical || lowAverage;
  return {
    ...report,
    shouldRevise,
    overallScore: weighted > 0 ? weighted : 0
  };
}
const LOG_PROMPT_KEYS = [
  "designer-agentic-system",
  "evaluator-design-quality",
  "evaluator-strategy-fidelity",
  "evaluator-implementation",
  "designer-agentic-revision-user"
];
function stripRawTrace(r) {
  const { rawTrace: _strip, ...rest } = r;
  return rest;
}
function stripAggregateForDisk(agg) {
  const { evaluatorTraces: _strip, ...rest } = agg;
  return rest;
}
async function writeAgenticEvalRunLog(input) {
  const root = path.join(input.baseDir, "eval-runs", input.runId);
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, "prompts"), { recursive: true });
  const meta = {
    runId: input.runId,
    stopReason: input.stopReason,
    finalOverallScore: input.finalAggregate.overallScore,
    strategyName: input.evaluationContext?.strategyName,
    hypothesisSnippet: input.evaluationContext?.hypothesis?.slice(0, 500),
    evaluationRoundCount: input.rounds.length
  };
  await writeFile(path.join(root, "meta.json"), `${JSON.stringify(meta, null, 2)}
`, "utf8");
  for (const key of LOG_PROMPT_KEYS) {
    const body = await getPromptBody(key);
    await writeFile(path.join(root, "prompts", `${key}.txt`), body, "utf8");
  }
  const ctx = await buildAgenticSystemContext({});
  for (const entry of ctx.skillCatalog) {
    const relPath = `skills/${entry.key}/SKILL.md`;
    const dest = path.join(root, relPath);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, entry.bodyMarkdown, "utf8");
  }
  for (const snap of input.rounds) {
    const rd = path.join(root, `round-${snap.round}`);
    const filesRoot = path.join(rd, "files");
    await mkdir(filesRoot, { recursive: true });
    const files = snap.files ?? {};
    for (const [p, c] of Object.entries(files)) {
      const safe = p.replace(/^\/+/, "").split("/").filter((seg) => seg !== ".." && seg !== "");
      if (safe.length === 0) continue;
      const fp = path.join(filesRoot, ...safe);
      await mkdir(path.dirname(fp), { recursive: true });
      await writeFile(fp, c, "utf8");
    }
    const dump = async (name) => {
      const w = snap[name];
      if (!w) return;
      if (w.rawTrace != null && w.rawTrace.length > 0) {
        await writeFile(path.join(rd, `${name}.raw.txt`), w.rawTrace, "utf8");
      }
      await writeFile(
        path.join(rd, `${name}.json`),
        `${JSON.stringify(stripRawTrace(w), null, 2)}
`,
        "utf8"
      );
    };
    await dump("design");
    await dump("strategy");
    await dump("implementation");
    await dump("browser");
    await writeFile(
      path.join(rd, "aggregate.json"),
      `${JSON.stringify(stripAggregateForDisk(snap.aggregate), null, 2)}
`,
      "utf8"
    );
    const rev = input.revisionPromptByEvalRound.get(snap.round);
    if (rev) {
      await writeFile(path.join(rd, "revision-prompt.txt"), rev, "utf8");
    }
  }
  await writeFile(path.join(root, "compiled-prompt.txt"), input.compiledPrompt, "utf8");
}
const CHECKPOINT_TODO_SUMMARY_MAX = 5;
async function emitOrchestratorEvent(ctx, e) {
  try {
    await ctx.onStream(e);
  } catch (err) {
    if (env.isDev) {
      console.error("[agentic-orchestrator] onStream failed", normalizeError(err), err);
    }
    ctx.onDeliveryFailure?.();
  }
}
function stripEvaluationSnapshotForStream(s) {
  const stripWorker = (w) => {
    if (!w) return w;
    const { rawTrace: _rt, ...rest } = w;
    return rest;
  };
  const { evaluatorTraces: _et, ...aggRest } = s.aggregate;
  return {
    ...s,
    design: stripWorker(s.design),
    strategy: stripWorker(s.strategy),
    implementation: stripWorker(s.implementation),
    browser: stripWorker(s.browser),
    aggregate: aggRest
  };
}
async function runEvaluationRound(options, streamCtx, round, files, parallel) {
  await emitOrchestratorEvent(streamCtx, {
    type: "evaluation_progress",
    round,
    phase: "parallel_start",
    message: parallel ? "Running design, strategy, and implementation evaluators in parallel…" : "Running evaluators sequentially…"
  });
  const workers = await runEvaluationWorkers({
    files,
    compiledPrompt: options.compiledPrompt,
    context: options.evaluationContext ?? void 0,
    providerId: options.build.providerId,
    modelId: options.build.modelId,
    evaluatorProviderId: options.evaluatorProviderId,
    evaluatorModelId: options.evaluatorModelId,
    parallel,
    correlationId: options.build.correlationId,
    signal: options.build.signal,
    onWorkerDone: async (rubric, report) => {
      await emitOrchestratorEvent(streamCtx, { type: "evaluation_worker_done", round, rubric, report });
    }
  });
  const rawAgg = aggregateEvaluationReports(workers, options.rubricWeights);
  const aggregate = enforceRevisionGate(rawAgg);
  const snapshot = {
    round,
    files: { ...files },
    design: workers.design,
    strategy: workers.strategy,
    implementation: workers.implementation,
    browser: workers.browser,
    aggregate
  };
  await emitOrchestratorEvent(streamCtx, {
    type: "evaluation_report",
    round,
    snapshot: stripEvaluationSnapshotForStream(snapshot)
  });
  return snapshot;
}
function appendEvaluationRoundHistory(snapshot, history) {
  history.push({
    round: snapshot.round,
    rubricMeans: rubricMeansFromNormalizedScores(snapshot.aggregate.normalizedScores),
    overallScore: snapshot.aggregate.overallScore,
    hardFailCount: snapshot.aggregate.hardFails.length,
    normalizedScores: { ...snapshot.aggregate.normalizedScores }
  });
}
function buildCheckpoint(files, rounds, opts) {
  const finalRound = rounds[rounds.length - 1];
  const completedTodos = finalRound ? [...finalRound.design?.findings.map((f) => f.summary) ?? []].slice(0, CHECKPOINT_TODO_SUMMARY_MAX) : [];
  return {
    totalRounds: rounds.length,
    filesWritten: Object.keys(files),
    finalTodosSummary: completedTodos.join("; ") || "No findings recorded",
    revisionBriefApplied: opts.revisionBriefApplied,
    completedAt: (/* @__PURE__ */ new Date()).toISOString(),
    stopReason: opts.stopReason,
    revisionAttempts: opts.revisionAttempts
  };
}
function agenticResult(files, rounds, snapshot, checkpointOpts, emittedFilePaths) {
  return {
    files,
    rounds,
    finalAggregate: snapshot.aggregate,
    checkpoint: buildCheckpoint(files, rounds, checkpointOpts),
    emittedFilePaths
  };
}
function buildSkippedEvalAggregate() {
  const normalizedScores = Object.fromEntries(
    EVALUATOR_RUBRIC_IDS.map((id) => [id, 0])
  );
  return {
    overallScore: 0,
    normalizedScores,
    hardFails: [],
    prioritizedFixes: [],
    shouldRevise: false,
    revisionBrief: ""
  };
}
function agenticBuildOnlyResult(files, emittedFilePaths, stopReason = "build_only") {
  const aggregate = buildSkippedEvalAggregate();
  return {
    files,
    rounds: [],
    finalAggregate: aggregate,
    checkpoint: buildCheckpoint(files, [], {
      stopReason,
      revisionAttempts: 0
    }),
    emittedFilePaths
  };
}
async function runAgenticPiSessionRound(options, streamCtx, forward, tracePhase, setPiTracePhase, sessionExtras) {
  const ctx = await buildAgenticSystemContext({ sessionType: options.sessionType });
  await emitSkillsLoadedEvents((e) => emitOrchestratorEvent(streamCtx, e), ctx.loadedSkills, tracePhase);
  setPiTracePhase(tracePhase);
  const extras = typeof sessionExtras === "function" ? sessionExtras(ctx) : sessionExtras;
  return runPiAgentSession(
    {
      ...options.build,
      ...extras,
      sessionType: options.sessionType ?? "design",
      systemPrompt: ctx.systemPrompt
    },
    forward
  );
}
function buildRevisionUserContext(compiledPrompt, evaluationContext) {
  const truncated = compiledPrompt.length > REVISION_COMPILED_PROMPT_MAX ? `${compiledPrompt.slice(0, REVISION_COMPILED_PROMPT_MAX)}
…[truncated]` : compiledPrompt;
  const parts = ["## Original design request (preserve intent)", "", truncated, ""];
  const ctx = evaluationContext;
  if (ctx?.strategyName) parts.push(`**Strategy:** ${ctx.strategyName}`);
  if (ctx?.hypothesis) parts.push(`**Hypothesis:** ${ctx.hypothesis}`);
  if (ctx?.rationale) parts.push(`**Rationale:** ${ctx.rationale}`);
  if (ctx?.measurements) parts.push(`**KPIs / measurements:** ${ctx.measurements}`);
  if (ctx?.objectivesMetrics) parts.push(`**Objectives & metrics:** ${ctx.objectivesMetrics}`);
  if (ctx?.designConstraints) parts.push(`**Design constraints:** ${ctx.designConstraints}`);
  if (parts.length > 4) parts.push("");
  return parts.join("\n");
}
function truncTrace(s, max) {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}
…[truncated]`;
}
const DEFAULT_TRACE_BUDGET = { design: 3e3, strategy: 3e3, implementation: 1500 };
function buildEvaluatorTracesSection(traces, budget = {}) {
  if (!traces || Object.keys(traces).length === 0) return "";
  const d = budget.design ?? DEFAULT_TRACE_BUDGET.design;
  const st = budget.strategy ?? DEFAULT_TRACE_BUDGET.strategy;
  const impl = budget.implementation ?? DEFAULT_TRACE_BUDGET.implementation;
  const parts = ["## Evaluator reasoning (raw model output)", ""];
  const order = ["design", "strategy", "implementation"];
  for (const rubric of order) {
    const raw = traces[rubric];
    if (raw == null || raw.length === 0) continue;
    const label = rubric === "design" ? "Design quality evaluator" : rubric === "strategy" ? "Strategy fidelity evaluator" : "Implementation evaluator";
    const b = rubric === "design" ? d : rubric === "strategy" ? st : impl;
    parts.push(`### ${label}`, "", truncTrace(raw, b), "");
  }
  return parts.join("\n").trimEnd();
}
function fmtMean(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}
function criterionDeltas(prev, curr) {
  const keys = /* @__PURE__ */ new Set([...Object.keys(prev), ...Object.keys(curr)]);
  const out = [];
  for (const k of keys) {
    const a = prev[k];
    const b = curr[k];
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    const delta = b - a;
    if (delta !== 0) out.push({ key: k, delta });
  }
  return out;
}
function buildRoundHistorySection(history) {
  if (history.length === 0) return "";
  const lines = ["## Revision history", "", "| Round | Design | Strategy | Impl | Browser | Overall | Hard fails |", "|---|---|---|---|---|---|---|"];
  for (const h of history) {
    lines.push(
      `| ${h.round} | ${fmtMean(h.rubricMeans.design)} | ${fmtMean(h.rubricMeans.strategy)} | ${fmtMean(h.rubricMeans.implementation)} | ${fmtMean(h.rubricMeans.browser)} | ${fmtMean(h.overallScore)} | ${h.hardFailCount} |`
    );
  }
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const curr = history[history.length - 1];
    const deltas = criterionDeltas(prev.normalizedScores, curr.normalizedScores);
    const improved = [...deltas].filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
    const regressed = [...deltas].filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);
    lines.push("");
    lines.push(
      `Rounds ${prev.round}→${curr.round}: rubric means Δ design ${formatDeltaNumber(curr.rubricMeans.design, prev.rubricMeans.design)}, strategy ${formatDeltaNumber(curr.rubricMeans.strategy, prev.rubricMeans.strategy)}, implementation ${formatDeltaNumber(curr.rubricMeans.implementation, prev.rubricMeans.implementation)}, browser ${formatDeltaNumber(curr.rubricMeans.browser, prev.rubricMeans.browser)}.`
    );
    if (improved.length) {
      lines.push(
        `Largest improvements: ${improved.map((x) => `${x.key} +${x.delta.toFixed(2)}`).join("; ")}.`
      );
    }
    if (regressed.length) {
      lines.push(
        `Largest regressions: ${regressed.map((x) => `${x.key} ${x.delta.toFixed(2)}`).join("; ")}.`
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}
function formatDeltaNumber(cur, prev) {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev)) return "n/a";
  const d = cur - prev;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(2)}`;
}
function buildRevisionUserPrompt(args) {
  const { compiledPrompt, evaluationContext, revisionUserInstructions, roundHistory, snapshot } = args;
  const tracesSection = buildEvaluatorTracesSection(snapshot.aggregate.evaluatorTraces);
  const parts = [
    buildRevisionUserContext(compiledPrompt, evaluationContext ?? void 0),
    revisionUserInstructions,
    "",
    buildRoundHistorySection(roundHistory),
    "## Revision brief",
    snapshot.aggregate.revisionBrief
  ];
  if (tracesSection.length > 0) {
    parts.push("", tracesSection);
  }
  parts.push(
    "",
    "## Prioritized fixes",
    ...snapshot.aggregate.prioritizedFixes.map((f, i) => `${i + 1}. ${f}`)
  );
  return parts.join("\n");
}
function decideStopReason(args) {
  if (args.aborted) return "aborted";
  if (args.satisfied) return "satisfied";
  return "max_revisions";
}
async function runAgenticWithEvaluation(options) {
  return runAgenticWithEvaluationImpl(options);
}
async function runAgenticWithEvaluationImpl(options) {
  const provider = getProvider(options.build.providerId);
  const parallel = provider?.supportsParallel ?? false;
  const streamFailureCtrl = options.streamFailureController ?? new AbortController();
  const upstreamSignal = options.build.signal;
  const effectiveSignal = upstreamSignal != null ? AbortSignal.any([upstreamSignal, streamFailureCtrl.signal]) : streamFailureCtrl.signal;
  const mergedOptions = {
    ...options,
    build: { ...options.build, signal: effectiveSignal }
  };
  const streamCtx = {
    onStream: options.onStream,
    onDeliveryFailure: () => streamFailureCtrl.abort()
  };
  const maxRevisions = Math.max(0, Math.min(MAX_REVISION_ROUNDS_CAP, options.maxRevisionRounds));
  const satisfactionOpts = options.minOverallScore != null && Number.isFinite(options.minOverallScore) ? { minOverallScore: options.minOverallScore } : void 0;
  const acquired = await acquireAgenticSlotOrReject();
  if (!acquired) {
    await emitOrchestratorEvent(streamCtx, {
      type: "error",
      payload: "Too many agentic design runs are active on this server. Please wait a moment and try again."
    });
    return null;
  }
  try {
    const revisionPromptByEvalRound = /* @__PURE__ */ new Map();
    const finishWithLog = (result) => {
      const baseDir = env.OBSERVABILITY_LOG_BASE_DIR;
      if (baseDir) {
        void writeAgenticEvalRunLog({
          baseDir,
          runId: mergedOptions.build.correlationId ?? randomUUID(),
          compiledPrompt: mergedOptions.compiledPrompt,
          evaluationContext: mergedOptions.evaluationContext ?? void 0,
          rounds: result.rounds,
          revisionPromptByEvalRound,
          stopReason: result.checkpoint.stopReason ?? "unknown",
          finalAggregate: result.finalAggregate
        }).catch((err) => {
          if (env.isDev) console.warn("[eval-run-log]", normalizeError(err), err);
        });
      }
      return result;
    };
    const tracePhaseRef = { current: "building" };
    const forward = async (e) => {
      if (e.type === "skill_activated") {
        await emitOrchestratorEvent(streamCtx, {
          type: "trace",
          trace: makeRunTraceEvent({
            kind: "skill_activated",
            label: `Skill activated: ${e.name} (${e.key})`,
            phase: tracePhaseRef.current,
            status: "success"
          })
        });
      }
      await emitOrchestratorEvent(streamCtx, e);
    };
    await emitOrchestratorEvent(streamCtx, { type: "phase", phase: "building" });
    const setPiTrace = (p) => {
      tracePhaseRef.current = p;
    };
    const buildResult = await runAgenticPiSessionRound(
      mergedOptions,
      streamCtx,
      forward,
      "building",
      setPiTrace,
      () => {
        const extra = mergedOptions.build.seedFiles ?? {};
        const seedFilesForBuild = Object.keys(extra).length > 0 ? extra : void 0;
        return { seedFiles: seedFilesForBuild };
      }
    );
    if (!buildResult) return null;
    if (effectiveSignal.aborted) {
      if (env.isDev) {
        console.debug("[agentic-orchestrator] build phase: effectiveSignal aborted after Pi session", {
          correlationId: mergedOptions.build.correlationId,
          upstreamAbort: upstreamSignal?.aborted ?? false,
          deliveryAbort: streamFailureCtrl.signal.aborted
        });
      }
      return finishWithLog(
        agenticBuildOnlyResult(
          buildResult.files,
          [...buildResult.emittedFilePaths ?? []],
          "aborted"
        )
      );
    }
    let files = buildResult.files;
    const emittedDuringRun = new Set(buildResult.emittedFilePaths ?? []);
    const rounds = [];
    const roundHistory = [];
    let revisionAttempts = 0;
    let lastRevisionBrief;
    const returnWithCheckpoint = (snapshotArg, stopReason2) => finishWithLog(
      agenticResult(
        files,
        rounds,
        snapshotArg,
        {
          stopReason: stopReason2,
          revisionAttempts,
          revisionBriefApplied: lastRevisionBrief
        },
        [...emittedDuringRun]
      )
    );
    if (mergedOptions.evaluationContext === null) {
      await emitOrchestratorEvent(streamCtx, { type: "phase", phase: "complete" });
      return finishWithLog(agenticBuildOnlyResult(files, [...emittedDuringRun]));
    }
    await emitOrchestratorEvent(streamCtx, { type: "phase", phase: "evaluating" });
    let evalRound = 1;
    let snapshot = await runEvaluationRound(mergedOptions, streamCtx, evalRound, files, parallel);
    rounds.push(snapshot);
    appendEvaluationRoundHistory(snapshot, roundHistory);
    if (effectiveSignal.aborted) {
      return returnWithCheckpoint(snapshot, "aborted");
    }
    const revisionUserInstructions = (await getPromptBody("designer-agentic-revision-user")).trim();
    while (!isEvalSatisfied(snapshot.aggregate, satisfactionOpts) && revisionAttempts < maxRevisions && !effectiveSignal.aborted) {
      await emitOrchestratorEvent(streamCtx, { type: "phase", phase: "revising" });
      const brief = snapshot.aggregate.revisionBrief;
      lastRevisionBrief = brief;
      await emitOrchestratorEvent(streamCtx, {
        type: "revision_round",
        round: revisionAttempts + 1,
        brief
      });
      const revisionUser = buildRevisionUserPrompt({
        compiledPrompt: options.compiledPrompt,
        evaluationContext: options.evaluationContext,
        revisionUserInstructions,
        roundHistory,
        snapshot
      });
      revisionPromptByEvalRound.set(snapshot.round, revisionUser);
      debugAgentIngest({
        hypothesisId: "H7",
        location: "agentic-orchestrator.ts:revision_start",
        message: "runDesignAgentSession (revision) starting",
        data: {
          revisionAttempt: revisionAttempts + 1,
          revisionUserChars: revisionUser.length,
          prioritizedFixesCount: snapshot.aggregate.prioritizedFixes.length,
          designFileCount: Object.keys(files).length
        }
      });
      const revised = await runAgenticPiSessionRound(mergedOptions, streamCtx, forward, "revising", setPiTrace, () => ({
        userPrompt: revisionUser,
        seedFiles: files,
        phase: "revision",
        initialProgressMessage: "Revising design from evaluation feedback…"
      }));
      if (!revised || effectiveSignal.aborted) {
        const stopReason2 = effectiveSignal.aborted ? "aborted" : "revision_failed";
        debugAgentIngest({
          hypothesisId: "H7",
          location: "agentic-orchestrator.ts:revision_end",
          message: "runDesignAgentSession (revision) aborted or null",
          data: { revisionAttempt: revisionAttempts + 1, aborted: !!effectiveSignal.aborted }
        });
        return returnWithCheckpoint(snapshot, stopReason2);
      }
      debugAgentIngest({
        hypothesisId: "H7",
        location: "agentic-orchestrator.ts:revision_end",
        message: "runDesignAgentSession (revision) finished",
        data: {
          revisionAttempt: revisionAttempts + 1,
          outFileCount: Object.keys(revised.files).length
        }
      });
      files = revised.files;
      for (const p of revised.emittedFilePaths ?? []) {
        emittedDuringRun.add(p);
      }
      revisionAttempts += 1;
      evalRound += 1;
      await emitOrchestratorEvent(streamCtx, { type: "phase", phase: "evaluating" });
      snapshot = await runEvaluationRound(mergedOptions, streamCtx, evalRound, files, parallel);
      rounds.push(snapshot);
      appendEvaluationRoundHistory(snapshot, roundHistory);
      if (effectiveSignal.aborted) {
        return returnWithCheckpoint(snapshot, "aborted");
      }
    }
    const stopReason = decideStopReason({
      aborted: effectiveSignal.aborted,
      satisfied: isEvalSatisfied(snapshot.aggregate, satisfactionOpts)
    });
    await emitOrchestratorEvent(streamCtx, { type: "phase", phase: "complete" });
    return returnWithCheckpoint(snapshot, stopReason);
  } finally {
    releaseAgenticSlot();
  }
}
async function executeGenerateStream(stream, body, abortSignal, options) {
  const { allocId, laneIndex, laneEndMode = "done", writeGate, correlationId } = options;
  const gate = writeGate ?? { enqueue: (fn) => fn() };
  const wrap = (data) => laneIndex !== void 0 ? { ...data, laneIndex } : data;
  const sseWriteAudit = env.isDev ? { byType: {}, skippedAbort: 0, t0: Date.now() } : null;
  const streamFailureCtrl = new AbortController();
  const sseWriteAbort = AbortSignal.any([abortSignal, streamFailureCtrl.signal]);
  const write = async (event, data) => {
    if (sseWriteAudit) sseWriteAudit.byType[event] = (sseWriteAudit.byType[event] ?? 0) + 1;
    const payload = JSON.stringify(wrap(data));
    await gate.enqueue(async () => {
      await stream.writeSSE({ data: payload, event, id: allocId() });
    });
  };
  const writeAgentic = async (event) => {
    if (sseWriteAbort.aborted) {
      if (sseWriteAudit) sseWriteAudit.skippedAbort += 1;
      return;
    }
    const { sseEvent, data } = agenticOrchestratorEventToSse(event);
    await write(sseEvent, data);
  };
  const runAgentic = async () => {
    const thinkingOverride = body.thinking ?? (body.thinkingLevel ? {
      level: body.thinkingLevel,
      budgetTokens: THINKING_BUDGET_BY_LEVEL[body.thinkingLevel]
    } : void 0);
    const designThinking = resolveThinkingConfig("design", body.modelId, thinkingOverride);
    const agenticResult2 = await runAgenticWithEvaluation({
      build: {
        userPrompt: body.prompt,
        providerId: body.providerId,
        modelId: body.modelId,
        thinkingLevel: designThinking.level,
        signal: abortSignal,
        ...correlationId ? { correlationId } : {}
      },
      streamFailureController: streamFailureCtrl,
      compiledPrompt: body.prompt,
      evaluationContext: body.evaluationContext,
      evaluatorProviderId: body.evaluatorProviderId,
      evaluatorModelId: body.evaluatorModelId,
      maxRevisionRounds: body.agenticMaxRevisionRounds ?? env.AGENTIC_MAX_REVISION_ROUNDS,
      minOverallScore: body.agenticMinOverallScore ?? env.AGENTIC_MIN_OVERALL_SCORE,
      rubricWeights: body.rubricWeights,
      onStream: writeAgentic
    });
    if (agenticResult2) {
      const alreadyEmitted = new Set(agenticResult2.emittedFilePaths ?? []);
      let replayed = 0;
      for (const [path2, content] of Object.entries(agenticResult2.files)) {
        if (!alreadyEmitted.has(path2)) {
          await writeAgentic({ type: "file", path: path2, content });
          replayed += 1;
        }
      }
      if (env.isDev && replayed > 0) {
        console.debug("[generate:SSE] replayed file events for paths not streamed live", {
          replayed,
          paths: Object.keys(agenticResult2.files).filter((p) => !alreadyEmitted.has(p))
        });
      }
    }
    if (agenticResult2?.checkpoint) {
      await write(SSE_EVENT_NAMES.checkpoint, { checkpoint: agenticResult2.checkpoint });
    }
    if (laneEndMode === "lane_done" && laneIndex !== void 0) {
      await write(SSE_EVENT_NAMES.lane_done, { laneIndex });
    } else {
      await write(SSE_EVENT_NAMES.done, {});
    }
    if (sseWriteAudit) {
      console.debug("[generate:SSE] agentic write summary", {
        byType: sseWriteAudit.byType,
        skippedAbort: sseWriteAudit.skippedAbort,
        durationMs: Date.now() - sseWriteAudit.t0,
        checkpoint: agenticResult2?.checkpoint ? {
          stopReason: agenticResult2.checkpoint.stopReason,
          filesWritten: agenticResult2.checkpoint.filesWritten,
          revisionAttempts: agenticResult2.checkpoint.revisionAttempts
        } : null
      });
    }
  };
  await runAgentic();
}
async function tryWriteSseErrorTail(stream, gate, options, primaryErr) {
  const payload = JSON.stringify(
    options.laneIndex !== void 0 ? { error: normalizeProviderError(primaryErr), laneIndex: options.laneIndex } : { error: normalizeProviderError(primaryErr) }
  );
  try {
    await gate.enqueue(async () => {
      await stream.writeSSE({
        data: payload,
        event: SSE_EVENT_NAMES.error,
        id: options.allocId()
      });
    });
  } catch (writeErr) {
    if (env.isDev) {
      console.error("[generate:SSE] failed to write error event (client likely disconnected)", writeErr);
    }
  }
  if (options.laneEndMode === "lane_done" && options.laneIndex !== void 0) {
    try {
      await gate.enqueue(async () => {
        await stream.writeSSE({
          data: JSON.stringify({ laneIndex: options.laneIndex }),
          event: SSE_EVENT_NAMES.lane_done,
          id: options.allocId()
        });
      });
    } catch (writeErr) {
      if (env.isDev) {
        console.error("[generate:SSE] failed to write lane_done after error", writeErr);
      }
    }
  }
}
async function executeGenerateStreamSafe(stream, body, abortSignal, options) {
  try {
    await executeGenerateStream(stream, body, abortSignal, options);
  } catch (err) {
    const gate = options.writeGate ?? { enqueue: (fn) => fn() };
    await tryWriteSseErrorTail(stream, gate, options, err);
  }
}
const generate = new Hono();
generate.post("/", async (c) => {
  const parsed = await parseRequestJson(c, GenerateStreamBodySchema, {
    devWarnLabel: "[generate]"
  });
  if (!parsed.ok) return parsed.response;
  const m = clampProviderModel(parsed.data.providerId, parsed.data.modelId, "design");
  const ev = clampEvaluatorOptional(parsed.data.evaluatorProviderId, parsed.data.evaluatorModelId);
  const body = { ...parsed.data, ...ev, providerId: m.providerId, modelId: m.modelId };
  const correlationId = body.correlationId?.trim() || crypto.randomUUID();
  if (env.isDev) {
    console.debug("[generate] request", {
      correlationId,
      provider: body.providerId,
      model: body.modelId,
      promptChars: body.prompt.length,
      evalContext: body.evaluationContext === null ? "build_only" : "eval"
    });
  }
  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    let id = 0;
    const allocId = () => String(id++);
    await executeGenerateStreamSafe(stream, body, abortSignal, {
      allocId,
      correlationId
    });
  });
});
const models = new Hono();
models.get("/:provider", async (c) => {
  const providerId = c.req.param("provider");
  const provider = getProvider(providerId);
  if (!provider) {
    return apiJsonError(c, 404, `Unknown provider: ${providerId}`);
  }
  const modelList = await provider.listModels();
  return c.json(modelList);
});
models.get("/", async (c) => {
  const providers2 = getAvailableProviders();
  return c.json(providers2.map((p) => ({ id: p.id, name: p.name, description: p.description })));
});
const AGENTIC_PHASE = {
  BUILDING: "building",
  EVALUATING: "evaluating",
  REVISING: "revising",
  COMPLETE: "complete"
};
const AGENTIC_PHASE_WIRE_VALUES = [
  AGENTIC_PHASE.BUILDING,
  AGENTIC_PHASE.EVALUATING,
  AGENTIC_PHASE.REVISING,
  AGENTIC_PHASE.COMPLETE
];
const agenticPhaseZodSchema = z.enum(AGENTIC_PHASE_WIRE_VALUES);
const runTraceKindSchema = z.enum([
  "run_started",
  "phase",
  "model_turn_start",
  "model_first_token",
  "tool_started",
  "tool_finished",
  "tool_failed",
  "files_planned",
  "file_written",
  "evaluation_progress",
  "evaluation_worker",
  "evaluation_report",
  "revision_round",
  "checkpoint",
  "compaction",
  "skills_loaded",
  "skill_activated"
]);
const runTraceEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  kind: runTraceKindSchema,
  label: z.string(),
  /** PI model turn index (1-based), set on `model_turn_start` for timeline grouping */
  turnId: z.number().optional(),
  phase: agenticPhaseZodSchema.optional(),
  round: z.number().optional(),
  toolName: z.string().optional(),
  path: z.string().optional(),
  status: z.enum(["info", "success", "warning", "error"]).optional(),
  detail: z.string().optional(),
  /** JSON snapshot of tool call arguments (server-truncated). */
  toolArgs: z.string().optional(),
  /** Truncated tool result body for observability (matches `detail` on tool_finished when set). */
  toolResult: z.string().optional()
});
const runTraceEventIngestSchema = runTraceEventSchema.passthrough();
const PostTraceBodySchema = z.object({
  correlationId: z.string().optional(),
  resultId: z.string().optional(),
  events: z.array(runTraceEventIngestSchema)
});
const logs = new Hono();
logs.get("/", (c) => {
  if (!env.isDev) {
    return c.body(null, 404);
  }
  return c.json({
    llm: getLogEntries(),
    trace: getTraceLogLines(),
    task: getTaskLogEntries()
  });
});
logs.post("/trace", async (c) => {
  if (!env.isDev) {
    return c.body(null, 404);
  }
  const parsed = await parseRequestJson(c, PostTraceBodySchema);
  if (!parsed.ok) return parsed.response;
  const { correlationId, resultId, events } = parsed.data;
  appendTraceLines(
    events.map((event) => ({
      event,
      correlationId,
      resultId
    }))
  );
  return c.json({ ok: true });
});
logs.delete("/", (c) => {
  if (!env.isDev) {
    return c.body(null, 404);
  }
  clearLogEntries();
  return c.body(null, 204);
});
function asSeverity(value) {
  return value === "error" || value === "warning" || value === "info" ? value : "info";
}
function normalizeLintReport(report) {
  const findings = report.findings?.map((finding) => ({
    severity: asSeverity(finding.severity),
    message: typeof finding.message === "string" ? finding.message : "Unknown DESIGN.md lint finding"
  })) ?? [];
  const counted = {
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    infos: findings.filter((f) => f.severity === "info").length
  };
  return {
    errors: typeof report.summary?.errors === "number" ? report.summary.errors : counted.errors,
    warnings: typeof report.summary?.warnings === "number" ? report.summary.warnings : counted.warnings,
    infos: typeof report.summary?.infos === "number" ? report.summary.infos : counted.infos,
    findings
  };
}
async function lintDesignMdDocument(content) {
  const mod = await import("@google/design.md/linter");
  return normalizeLintReport(mod.lint(content));
}
const designSystem = new Hono();
function escapePromptAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
designSystem.post("/extract", async (c) => {
  const parsed = await parseRequestJson(c, DesignSystemExtractRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId, "design-system");
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };
  const imageDescriptions = (body.images ?? []).map((img, i) => {
    const name = img.name ?? img.filename ?? `screenshot-${i + 1}`;
    return `Image ${i + 1}: ${name}${img.description ? ` — ${img.description}` : ""}`;
  }).join("\n");
  const markdownSources = (body.markdownSources ?? []).filter((source) => source.content.trim()).map(
    (source) => `<markdown_source filename="${escapePromptAttribute(source.filename)}" sizeBytes="${source.sizeBytes}">
${source.content.trim()}
</markdown_source>`
  ).join("\n\n");
  const guidance = await inlineGuidance("design-system-extract-system", "design_md_extraction_guidance");
  const agentUserPrompt = `<task>
Create a Google DESIGN.md document from the provided design-system source material.

Treat the guidance below as the authoritative contract for the Google/Stitch DESIGN.md schema, section order, inference policy, and lint-friendly output.

Analyze the written source material, uploaded Markdown sources, and any UI screenshots, then write the complete Markdown document to \`DESIGN.md\` in the workspace root.

Uploaded Markdown sources, including files already named \`DESIGN.md\`, are source evidence. Do not assume they are already canonical or lint-clean. Preserve their intent, repair schema/section/token issues where needed, normalize them into the current Google/Stitch DESIGN.md format, and produce one complete lint-friendly \`DESIGN.md\`.
</task>

${guidance}

<design_system_title>
${body.title ?? "Design System"}
</design_system_title>

<source_hash>
${body.sourceHash ?? "(not provided)"}
</source_hash>

<written_source>
${body.content?.trim() ?? ""}
</written_source>

<markdown_sources>
${markdownSources}
</markdown_sources>

<screenshots>
${imageDescriptions}
</screenshots>

Generate DESIGN.md from this design-system source.`;
  return runTaskAgentRoute(c, {
    routeLabel: "design-system",
    body,
    userPrompt: agentUserPrompt,
    sessionType: "design-system",
    thinkingTask: "design-system",
    resultFile: "DESIGN.md",
    initialProgressMessage: "Generating DESIGN.md…",
    debugPayload: (b) => ({
      imageCount: b.images?.length ?? 0,
      hasText: Boolean(b.content?.trim())
    }),
    onTaskResult: async (taskResult, { write }) => {
      const result = taskResult.result.trim();
      const lint = await lintDesignMdDocument(result);
      if (lint.errors > 0) {
        throw new Error(
          `Generated DESIGN.md failed lint with ${lint.errors} error${lint.errors === 1 ? "" : "s"}.`
        );
      }
      await write(SSE_EVENT_NAMES.task_result, { result, lint });
    }
  });
});
const NODE_TYPES = {
  DESIGN_SYSTEM: "designSystem"
};
function getDesignSystemNodeData(node) {
  if (!node || node.type !== NODE_TYPES.DESIGN_SYSTEM) return void 0;
  return node.data;
}
const DEFAULT_DESIGN_SYSTEM_SOURCE_MODE = "none";
const DESIGN_SYSTEM_SOURCE_MODES = ["none", "wireframe", "custom"];
function isDesignSystemSourceMode(value) {
  return typeof value === "string" && DESIGN_SYSTEM_SOURCE_MODES.includes(value);
}
function formatDesignSystemSourceMarkdown(source) {
  const parts = [];
  if (source.content?.trim()) parts.push(source.content.trim());
  for (const asset of source.markdownSources ?? []) {
    if (!asset.content.trim()) continue;
    parts.push(`## Markdown source: ${asset.filename}
${asset.content.trim()}`);
  }
  return parts.join("\n\n---\n\n");
}
function workspaceSnapshotWireToGraph(snapshot) {
  return {
    nodes: snapshot.nodes,
    edges: snapshot.edges
  };
}
function collectDesignSystemFromDomain(hypothesis2, designSystems) {
  if (!hypothesis2) return void 0;
  const parts = [];
  for (const dsId of hypothesis2.designSystemNodeIds) {
    const ds = designSystems[dsId];
    if (!ds) continue;
    const source = domainDesignSystemSource(ds);
    if (source.mode === "none") continue;
    const c = ds.designMdDocument?.content || formatDesignSystemSourceMarkdown(source) || "";
    const t = ds.title || "Design System";
    if (c.trim()) parts.push(`## ${t}
${c}`);
  }
  return parts.join("\n\n---\n\n");
}
function getDomainDesignSystemSourceMode(ds) {
  if (ds.sourceMode === "off") return "none";
  if (ds.sourceMode) return ds.sourceMode;
  return designSystemSourceHasInputLocal(ds) ? "custom" : DEFAULT_DESIGN_SYSTEM_SOURCE_MODE;
}
function domainDesignSystemSource(ds) {
  const mode = getDomainDesignSystemSourceMode(ds);
  if (mode === "none") return emptyDesignSystemSource(ds.title);
  return {
    mode,
    title: ds.title,
    content: ds.content,
    images: ds.images,
    markdownSources: ds.markdownSources
  };
}
function getNodeDesignSystemSourceMode(data) {
  if (data.sourceMode === "off") return "none";
  if (isDesignSystemSourceMode(data.sourceMode)) return data.sourceMode;
  return designSystemSourceHasInputLocal(data) ? "custom" : DEFAULT_DESIGN_SYSTEM_SOURCE_MODE;
}
function designSystemSourceHasInputLocal(source) {
  return typeof source.content === "string" && source.content.trim().length > 0 || Array.isArray(source.images) && source.images.length > 0 || Array.isArray(source.markdownSources) && source.markdownSources.some(
    (asset) => typeof asset === "object" && asset !== null && "content" in asset && typeof asset.content === "string" && asset.content.trim().length > 0
  );
}
function emptyDesignSystemSource(title) {
  return {
    mode: "none",
    title: title || "Design System",
    content: "",
    images: [],
    markdownSources: []
  };
}
function collectDesignSystemFromGraph(snapshot, targetNodeId) {
  const incomingEdges = snapshot.edges.filter((e) => e.target === targetNodeId);
  const dsNodes = incomingEdges.map((e) => snapshot.nodes.find((n) => n.id === e.source && n.type === NODE_TYPES.DESIGN_SYSTEM)).filter(Boolean);
  if (dsNodes.length === 0) return void 0;
  const parts = dsNodes.map((n) => {
    const data = getDesignSystemNodeData(n);
    if (!data) return "";
    const mode = getNodeDesignSystemSourceMode(data);
    if (mode === "none") return "";
    const source = {
      title: data.title,
      content: data.content,
      images: data.images,
      markdownSources: data.markdownSources
    };
    const t = data?.title || "Design System";
    const c = data?.designMdDocument?.content || formatDesignSystemSourceMarkdown(source) || "";
    return c.trim() ? `## ${t}
${c}` : "";
  }).filter(Boolean);
  return parts.join("\n\n---\n\n");
}
function buildHypothesisGenerationContextFromInputs(input) {
  const { hypothesisNodeId, hypothesisStrategy, spec, snapshot, domainHypothesis } = input;
  const modelCredentials = [input.settingsCredential];
  let designSystemContent;
  if (domainHypothesis && domainHypothesis.designSystemNodeIds.length > 0) {
    designSystemContent = collectDesignSystemFromDomain(domainHypothesis, input.designSystems);
  } else {
    designSystemContent = collectDesignSystemFromGraph(snapshot, hypothesisNodeId);
  }
  return {
    hypothesisNodeId,
    hypothesisStrategy,
    dimensions: input.dimensions ?? [],
    spec,
    modelCredentials,
    designSystemContent
  };
}
function provenanceFromHypothesisContext(ctx) {
  const s = ctx.hypothesisStrategy;
  return {
    strategies: {
      [s.id]: {
        name: s.name,
        hypothesis: s.hypothesis,
        rationale: s.rationale,
        dimensionValues: s.dimensionValues
      }
    },
    designSystemSnapshot: ctx.designSystemContent || void 0
  };
}
function evaluationPayloadFromHypothesisContext(ctx) {
  const s = ctx.hypothesisStrategy;
  return {
    strategyName: s.name,
    hypothesis: s.hypothesis,
    rationale: s.rationale,
    measurements: s.measurements,
    dimensionValues: s.dimensionValues,
    objectivesMetrics: ctx.spec.sections["objectives-metrics"]?.content,
    designConstraints: ctx.spec.sections["design-constraints"]?.content,
    designSystemSnapshot: ctx.designSystemContent || void 0
  };
}
function getSectionContent(spec, sectionId) {
  const section = spec.sections[sectionId];
  if (!section) return "(Not provided)";
  return section.content.trim() || "(Not provided)";
}
function formatExplorationAxes(dimensions) {
  if (dimensions.length === 0) return "(No global exploration axes were provided)";
  return dimensions.map((dimension) => {
    const constancy = dimension.isConstant ? "constant" : "variable";
    return `- ${dimension.name} (${constancy}): ${dimension.range}`;
  }).join("\n");
}
function buildHypothesisPrompt(spec, strategy2, hypothesisTemplate, dimensions = [], designSystemOverride, designAgentInstructions = "") {
  const dimensionValuesList = Object.entries(strategy2.dimensionValues).map(([dim, val]) => `- ${dim}: ${val}`).join("\n");
  return interpolate(hypothesisTemplate, {
    STRATEGY_NAME: strategy2.name,
    HYPOTHESIS: strategy2.hypothesis,
    RATIONALE: strategy2.rationale,
    MEASUREMENTS: strategy2.measurements,
    EXPLORATION_AXES: formatExplorationAxes(dimensions),
    DIMENSION_VALUES: dimensionValuesList || "(No selected hypothesis position was provided)",
    DESIGN_BRIEF: getSectionContent(spec, "design-brief"),
    RESEARCH_CONTEXT: getSectionContent(spec, "research-context"),
    OBJECTIVES_METRICS: getSectionContent(spec, "objectives-metrics"),
    DESIGN_CONSTRAINTS: getSectionContent(spec, "design-constraints"),
    DESIGN_SYSTEM: designSystemOverride ?? getSectionContent(spec, "design-system"),
    DESIGN_AGENT_INSTRUCTIONS: designAgentInstructions
  });
}
function incubateHypothesisPrompts(spec, incubationPlan, hypothesisTemplate, designSystemOverride, designAgentInstructions = "") {
  return incubationPlan.hypotheses.map((strategy2) => ({
    id: generateId(),
    strategyId: strategy2.id,
    specId: spec.id,
    prompt: buildHypothesisPrompt(
      spec,
      strategy2,
      hypothesisTemplate,
      incubationPlan.dimensions,
      designSystemOverride,
      designAgentInstructions
    ),
    images: [],
    compiledAt: now()
  }));
}
async function buildHypothesisWorkspaceBundle(body) {
  const ctxRaw = buildHypothesisGenerationContextFromInputs({
    hypothesisNodeId: body.hypothesisNodeId,
    hypothesisStrategy: body.strategy,
    dimensions: body.dimensions ?? [],
    spec: body.spec,
    snapshot: workspaceSnapshotWireToGraph(body.snapshot),
    domainHypothesis: body.domainHypothesis ?? void 0,
    designSystems: body.designSystems,
    settingsCredential: body.settingsCredential
  });
  if (!ctxRaw) return null;
  const ctx = applyLockdownToHypothesisContext(ctxRaw);
  const [hypothesisTemplate, designAgentInstructions] = await Promise.all([
    getPromptBody("designer-hypothesis-inputs"),
    getPromptBody("designer-agent-instructions")
  ]);
  const filteredPlan = {
    id: generateId(),
    specId: ctx.spec.id,
    dimensions: [...ctx.dimensions],
    hypotheses: [ctx.hypothesisStrategy],
    generatedAt: now()
  };
  const prompts = incubateHypothesisPrompts(
    ctx.spec,
    filteredPlan,
    hypothesisTemplate,
    ctx.designSystemContent,
    designAgentInstructions.trim()
  );
  const evaluationContext = evaluationPayloadFromHypothesisContext(ctx);
  const provenance = provenanceFromHypothesisContext(ctx);
  return { ctx, prompts, evaluationContext, provenance };
}
const hypothesis = new Hono();
hypothesis.post("/prompt-bundle", async (c) => {
  const parsed = await parseRequestJson(c, PromptBundleRequestSchema, {
    devWarnLabel: "[hypothesis] POST /prompt-bundle"
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const bundle = await buildHypothesisWorkspaceBundle(body);
  if (!bundle) {
    return apiJsonError(c, 400, "No model credentials for this hypothesis");
  }
  const { ctx, prompts, evaluationContext, provenance } = bundle;
  const evalActive = body.domainHypothesis?.revisionEnabled === true;
  return c.json({
    prompts,
    evaluationContext: evalActive ? evaluationContext ?? null : null,
    provenance,
    generationContext: {
      modelCredentials: ctx.modelCredentials.map((cred) => ({
        providerId: cred.providerId,
        modelId: cred.modelId,
        thinkingLevel: cred.thinkingLevel
      }))
    }
  });
});
hypothesis.post("/generate", async (c) => {
  const parsed = await parseRequestJson(c, HypothesisGenerateRequestSchema, {
    devWarnLabel: "[hypothesis] POST /generate"
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const bundle = await buildHypothesisWorkspaceBundle(body);
  if (!bundle) {
    return apiJsonError(c, 400, "No model credentials for this hypothesis");
  }
  const { ctx, prompts, evaluationContext } = bundle;
  if (prompts.length === 0) {
    return apiJsonError(c, 400, "No prompts to generate");
  }
  const prompt = prompts[0];
  const modelCredentials = [...ctx.modelCredentials];
  const parallel = modelCredentials.every((cred) => getProvider(cred.providerId)?.supportsParallel ?? false);
  const evaluatorClamp = clampEvaluatorOptional(body.evaluatorProviderId, body.evaluatorModelId);
  const evalActive = body.domainHypothesis?.revisionEnabled === true;
  const effectiveEvaluationContext = evalActive ? evaluationContext : null;
  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    let id = 0;
    const allocId = () => String(id++);
    const gate = createWriteGate();
    const baseCorrelation = body.correlationId?.trim() || crypto.randomUUID();
    if (env.isDev) {
      console.debug("[hypothesis/generate] request", {
        correlationId: baseCorrelation,
        lanes: modelCredentials.length,
        promptChars: prompt.prompt.length,
        evalContext: effectiveEvaluationContext === null ? "build_only" : "eval"
      });
    }
    const base = {
      prompt: prompt.prompt,
      supportsVision: body.supportsVision,
      evaluatorProviderId: evaluatorClamp.evaluatorProviderId,
      evaluatorModelId: evaluatorClamp.evaluatorModelId,
      agenticMaxRevisionRounds: body.agenticMaxRevisionRounds,
      agenticMinOverallScore: body.agenticMinOverallScore,
      rubricWeights: body.rubricWeights
    };
    const runLane = async (laneIndex, cred) => {
      const laneThinking = resolveThinkingConfig("design", cred.modelId, {
        level: cred.thinkingLevel,
        budgetTokens: THINKING_BUDGET_BY_LEVEL[cred.thinkingLevel]
      });
      const streamBody = GenerateStreamBodySchema.parse({
        ...base,
        thinkingLevel: laneThinking.level,
        thinking: laneThinking,
        evaluationContext: effectiveEvaluationContext,
        providerId: cred.providerId,
        modelId: cred.modelId,
        correlationId: `${baseCorrelation}:lane-${laneIndex}`
      });
      await executeGenerateStreamSafe(stream, streamBody, abortSignal, {
        allocId,
        laneIndex,
        laneEndMode: "lane_done",
        writeGate: gate,
        correlationId: `${baseCorrelation}:lane-${laneIndex}`
      });
    };
    try {
      if (parallel) {
        await Promise.all(
          modelCredentials.map((cred, i) => runLane(i, cred))
        );
      } else {
        for (let i = 0; i < modelCredentials.length; i++) {
          const cred = modelCredentials[i];
          await runLane(i, cred);
        }
      }
      await gate.enqueue(async () => {
        await stream.writeSSE({ data: "{}", event: SSE_EVENT_NAMES.done, id: allocId() });
      });
    } catch (err) {
      await gate.enqueue(async () => {
        await stream.writeSSE({
          data: JSON.stringify({ error: normalizeProviderError(err) }),
          event: SSE_EVENT_NAMES.error,
          id: allocId()
        });
        await stream.writeSSE({ data: "{}", event: SSE_EVENT_NAMES.done, id: allocId() });
      });
    }
  });
});
function mimeForPath(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".ttf")) return "font/ttf";
  if (lower.endsWith(".otf")) return "font/otf";
  return "application/octet-stream";
}
function approximatePreviewFilesUtf8Bytes(files) {
  let n = 0;
  for (const [k, v] of Object.entries(files)) {
    n += Buffer$1.byteLength(k, "utf8") + Buffer$1.byteLength(v, "utf8");
  }
  return n;
}
const previewSessionFilesBodySchema = z.object({
  files: z.record(z.string(), z.string())
});
async function parsePreviewSessionFiles(c) {
  const parsed = await parseRequestJson(c, previewSessionFilesBodySchema);
  if (!parsed.ok) return parsed;
  const normalized = normalizePreviewFiles(parsed.data.files);
  if (!normalized.ok) {
    return { ok: false, response: apiJsonError(c, 400, normalized.error) };
  }
  const { files } = normalized;
  if (Object.keys(files).length === 0) {
    return { ok: false, response: apiJsonError(c, 400, "files must be non-empty") };
  }
  const entry = resolvePreviewEntryPath(files);
  if (!files[entry]) {
    return { ok: false, response: apiJsonError(c, 400, "Preview files must include an HTML entry") };
  }
  if (approximatePreviewFilesUtf8Bytes(files) > env.MAX_PREVIEW_PAYLOAD_BYTES) {
    return { ok: false, response: apiJsonError(c, 413, "Preview files payload too large") };
  }
  return { ok: true, files };
}
function normalizePreviewFiles(files) {
  const normalized = {};
  for (const [rawPath, content] of Object.entries(files)) {
    const path2 = normalizePreviewPath(rawPath);
    if (path2 == null) return { ok: false, error: "Invalid preview file path" };
    if (Object.prototype.hasOwnProperty.call(normalized, path2)) {
      return { ok: false, error: "Duplicate preview file path" };
    }
    normalized[path2] = content;
  }
  return { ok: true, files: normalized };
}
function normalizePreviewPath(rawPath) {
  for (let i = 0; i < rawPath.length; i += 1) {
    const code = rawPath.charCodeAt(i);
    if (code < 32 || code === 127) return null;
  }
  if (rawPath.startsWith("/") || rawPath.startsWith("\\")) return null;
  const segments = rawPath.replace(/\\/g, "/").split("/");
  const out = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.length === 0 ? null : out.join("/");
}
const preview = new Hono();
preview.post("/sessions", async (c) => {
  const parsed = await parsePreviewSessionFiles(c);
  if (!parsed.ok) return parsed.response;
  const { files } = parsed;
  const id = createPreviewSession(files);
  const entry = resolvePreviewEntryPath(files);
  return c.json({ id, entry });
});
preview.put("/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = await parsePreviewSessionFiles(c);
  if (!parsed.ok) return parsed.response;
  const { files } = parsed;
  const ok = replacePreviewSessionFiles(id, files);
  if (!ok) return apiJsonError(c, 404, "Unknown or expired session");
  const entry = resolvePreviewEntryPath(files);
  return c.json({ ok: true, entry });
});
preview.delete("/sessions/:id", (c) => {
  const id = c.req.param("id");
  deletePreviewSession(id);
  return c.json({ ok: true });
});
function filePathFromPreviewUrl(url, sessionId) {
  const pathname = new URL(url).pathname;
  const marker = `/api/preview/sessions/${sessionId}/`;
  const idx = pathname.indexOf(marker);
  if (idx === -1) return null;
  const rest = pathname.slice(idx + marker.length).replace(/\/$/, "");
  if (!rest) return "";
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}
preview.get("/sessions/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const pathname = new URL(c.req.url).pathname;
  const base = `/api/preview/sessions/${sessionId}`;
  if (pathname !== base && pathname !== `${base}/`) return c.text("Not found", 404);
  const snap = getPreviewSessionSnapshot(sessionId);
  if (!snap) return c.text("Not found", 404);
  const entry = resolvePreviewEntryPath(snap);
  const loc = new URL(c.req.url);
  loc.pathname = `${base}/${encodeVirtualPathForUrl(entry)}`;
  return c.redirect(loc.toString(), 302);
});
preview.get("/sessions/:sessionId/*", (c) => {
  const sessionId = c.req.param("sessionId");
  const rel = filePathFromPreviewUrl(c.req.url, sessionId);
  if (rel === null || rel === "") return c.text("Not found", 404);
  const content = getPreviewSessionFile(sessionId, rel);
  if (content === void 0) return c.text("Not found", 404);
  return c.body(content, 200, {
    "Content-Type": mimeForPath(rel),
    "Cache-Control": "private, max-age=0, must-revalidate"
  });
});
const dimensionRangeSchema = z.union([
  z.string(),
  z.array(z.string()).transform((a) => a.join(", "))
]);
const DimensionSchema = z.object({
  name: z.string(),
  range: dimensionRangeSchema,
  isConstant: z.boolean()
});
const HypothesisStrategyWireSchema = z.object({
  id: z.string(),
  name: z.string(),
  hypothesis: z.string(),
  rationale: z.string(),
  measurements: z.string(),
  dimensionValues: z.record(z.string(), z.string())
});
z.object({
  id: z.string(),
  specId: z.string(),
  dimensions: z.array(DimensionSchema),
  hypotheses: z.array(HypothesisStrategyWireSchema),
  generatedAt: z.string(),
  approvedAt: z.string().optional(),
  incubatorModel: z.string()
});
const CompiledPromptSchema = z.object({
  id: z.string(),
  strategyId: z.string(),
  specId: z.string(),
  prompt: z.string(),
  images: z.array(ReferenceImageSchema),
  compiledAt: z.string()
});
const EvaluationContextPayloadSchema = z.object({
  strategyName: z.string().optional(),
  hypothesis: z.string().optional(),
  rationale: z.string().optional(),
  measurements: z.string().optional(),
  dimensionValues: z.record(z.string(), z.string()).optional(),
  objectivesMetrics: z.string().optional(),
  designConstraints: z.string().optional(),
  designSystemSnapshot: z.string().optional(),
  outputFormat: z.string().optional()
}).passthrough();
const ProvenanceContextSchema = z.object({
  strategies: z.record(
    z.string(),
    z.object({
      name: z.string(),
      hypothesis: z.string(),
      rationale: z.string(),
      dimensionValues: z.record(z.string(), z.string())
    })
  ),
  designSystemSnapshot: z.string().optional()
});
z.object({
  prompts: z.array(CompiledPromptSchema),
  evaluationContext: EvaluationContextPayloadSchema.nullable(),
  provenance: ProvenanceContextSchema,
  generationContext: z.object({
    modelCredentials: z.array(
      z.object({
        providerId: z.string(),
        modelId: z.string(),
        thinkingLevel: ThinkingLevelSchema
      })
    )
  })
});
const ProviderModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  contextLength: z.number().optional(),
  supportsVision: z.boolean().optional(),
  supportsReasoning: z.boolean().optional()
});
z.array(ProviderModelSchema);
const ProviderInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string()
});
z.array(ProviderInfoSchema);
const OpenRouterBudgetStatusSchema = z.enum([
  "available",
  "out_of_credits",
  "rate_limited",
  "not_configured",
  "unknown"
]);
const OpenRouterLimitResetSchema = z.enum(["daily", "weekly", "monthly"]).nullable();
const OpenRouterBudgetStatusResponseSchema = z.object({
  status: OpenRouterBudgetStatusSchema,
  limit: z.number().nullable().optional(),
  limitRemaining: z.number().nullable().optional(),
  limitReset: OpenRouterLimitResetSchema.optional(),
  usageDaily: z.number().optional(),
  resetAt: z.string().optional(),
  checkedAt: z.string(),
  message: z.string()
});
z.object({
  result: z.string(),
  lint: z.object({
    errors: z.number().int().min(0),
    warnings: z.number().int().min(0),
    infos: z.number().int().min(0),
    findings: z.array(
      z.object({
        severity: z.enum(["error", "warning", "info"]),
        message: z.string()
      })
    ).optional()
  }).optional()
});
z.object({
  result: z.string()
});
const DefaultRubricWeightsSchema = z.object({
  design: z.number(),
  strategy: z.number(),
  implementation: z.number(),
  browser: z.number()
});
const AppConfigResponseSchema = z.object({
  lockdown: z.boolean(),
  /** Server operator default; client Settings may override per session. */
  agenticMaxRevisionRounds: z.number().int().min(0).max(20),
  agenticMinOverallScore: z.number().min(0).max(5).nullable(),
  /** Matches repo defaults until promotion or manual edit + server restart. */
  defaultRubricWeights: DefaultRubricWeightsSchema,
  /** Server env `MAX_CONCURRENT_AGENTIC_RUNS` (1-100); parallel design/hypothesis lanes each use one slot. */
  maxConcurrentRuns: z.number().int().min(1).max(100),
  /** When false, the evaluator-driven revision loop UI is hidden on hypothesis nodes. */
  autoImprove: z.boolean()
});
const configRoute = new Hono();
configRoute.get("/", (c) => {
  return c.json(
    AppConfigResponseSchema.parse({
      lockdown: FEATURE_LOCKDOWN,
      agenticMaxRevisionRounds: env.AGENTIC_MAX_REVISION_ROUNDS,
      agenticMinOverallScore: env.AGENTIC_MIN_OVERALL_SCORE ?? null,
      defaultRubricWeights: { ...DEFAULT_RUBRIC_WEIGHTS },
      maxConcurrentRuns: env.MAX_CONCURRENT_AGENTIC_RUNS,
      autoImprove: FEATURE_AUTO_IMPROVE
    })
  );
});
const OpenRouterKeyResponseSchema = z.object({
  data: z.object({
    limit: z.number().nullable(),
    limit_remaining: z.number().nullable(),
    limit_reset: z.enum(["daily", "weekly", "monthly"]).nullable(),
    usage_daily: z.number().optional()
  }).passthrough()
}).passthrough();
function iso(date) {
  return date.toISOString();
}
function nextOpenRouterResetAt(limitReset, now2 = /* @__PURE__ */ new Date()) {
  if (limitReset === null) return void 0;
  const next = new Date(now2.getTime());
  next.setUTCHours(0, 0, 0, 0);
  if (limitReset === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
    return iso(next);
  }
  if (limitReset === "weekly") {
    const day = next.getUTCDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    next.setUTCDate(next.getUTCDate() + daysUntilMonday);
    return iso(next);
  }
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  return iso(next);
}
function baseStatus(status, checkedAt, message) {
  return { status, checkedAt, message };
}
async function getOpenRouterBudgetStatus(options) {
  const apiKey = env.OPENROUTER_API_KEY;
  const baseUrl = env.OPENROUTER_BASE_URL.replace(/\/$/, "");
  const now2 = /* @__PURE__ */ new Date();
  const checkedAt = iso(now2);
  const fetchImpl = fetch;
  if (!apiKey.trim()) {
    return baseStatus("not_configured", checkedAt, "OpenRouter is not configured.");
  }
  let response;
  try {
    response = await fetchImpl(`${baseUrl}/api/v1/key`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
  } catch {
    return baseStatus("unknown", checkedAt, "Could not check OpenRouter credits.");
  }
  if (response.status === 429) {
    return baseStatus("rate_limited", checkedAt, "OpenRouter credit check is rate limited.");
  }
  if (!response.ok) {
    let text = "";
    try {
      text = await response.text();
    } catch {
      text = "";
    }
    const creditMessage = normalizeOpenRouterCreditError(text || `OpenRouter API error (${response.status})`);
    if (creditMessage) {
      return baseStatus("out_of_credits", checkedAt, creditMessage);
    }
    return baseStatus("unknown", checkedAt, "Could not check OpenRouter credits.");
  }
  let json;
  try {
    json = await response.json();
  } catch {
    return baseStatus("unknown", checkedAt, "Could not check OpenRouter credits.");
  }
  const parsed = OpenRouterKeyResponseSchema.safeParse(json);
  if (!parsed.success) {
    return baseStatus("unknown", checkedAt, "Could not check OpenRouter credits.");
  }
  const key = parsed.data.data;
  const resetAt = nextOpenRouterResetAt(key.limit_reset, now2);
  const status = key.limit_remaining !== null && key.limit_remaining <= 0 ? "out_of_credits" : "available";
  return {
    status,
    limit: key.limit,
    limitRemaining: key.limit_remaining,
    limitReset: key.limit_reset,
    usageDaily: key.usage_daily,
    resetAt,
    checkedAt,
    message: status === "out_of_credits" ? OPENROUTER_CREDIT_EXHAUSTED_MESSAGE : "OpenRouter credits are available."
  };
}
const providerStatus = new Hono();
providerStatus.get("/openrouter", async (c) => {
  const status = await getOpenRouterBudgetStatus();
  return c.json(OpenRouterBudgetStatusResponseSchema.parse(status));
});
function appendBlock(lines, tag, body) {
  const t = body?.trim();
  if (!t) return;
  lines.push(`<${tag}>
${t}
</${tag}>`);
}
function buildInputsGenerateUserMessage(input) {
  const lines = [
    "Using the following inputs, produce the body text for <target_input> only, following your system rules.",
    `<target_input>${input.targetInput}</target_input>`,
    `<design_brief>
${input.designBrief.trim()}
</design_brief>`
  ];
  if (input.targetInput !== "research-context") {
    appendBlock(lines, "research_context", input.researchContext);
  }
  if (input.targetInput !== "objectives-metrics") {
    appendBlock(lines, "objectives_metrics", input.objectivesMetrics);
  }
  if (input.targetInput !== "design-constraints") {
    appendBlock(lines, "design_constraints", input.designConstraints);
  }
  const targetDraft = input.targetInput === "research-context" ? input.researchContext : input.targetInput === "objectives-metrics" ? input.objectivesMetrics : input.designConstraints;
  appendBlock(lines, "current_input_draft", targetDraft);
  return lines.join("\n\n");
}
const inputsGenerate = new Hono();
const INPUT_LABELS = {
  "research-context": "Research & Context",
  "objectives-metrics": "Objectives & Metrics",
  "design-constraints": "Design Constraints"
};
const INPUT_PROMPT_KEYS = {
  "research-context": "inputs-gen-research-context",
  "objectives-metrics": "inputs-gen-objectives-metrics",
  "design-constraints": "inputs-gen-design-constraints"
};
inputsGenerate.post("/generate", async (c) => {
  const parsed = await parseRequestJson(c, InputsGenerateRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId, "inputs");
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };
  const contextMessage = buildInputsGenerateUserMessage({
    targetInput: body.inputId,
    designBrief: body.designBrief,
    researchContext: body.researchContext,
    objectivesMetrics: body.objectivesMetrics,
    designConstraints: body.designConstraints
  });
  const label = INPUT_LABELS[body.inputId] ?? body.inputId;
  const promptKey = INPUT_PROMPT_KEYS[body.inputId];
  const guidance = promptKey ? await inlineGuidance(promptKey, "input_generator_guidance") : "";
  const agentUserPrompt = `<task>
Generate the **${label}** section content for a design specification.

Write the result as plain text to \`result.txt\` in the workspace root.
The output should be ready to paste into a textarea — no JSON wrapping, no markdown code fences, no meta commentary.
</task>

${guidance ? `${guidance}

` : ""}${contextMessage}`;
  return runTaskAgentRoute(c, {
    routeLabel: "inputs-generate",
    body,
    userPrompt: agentUserPrompt,
    sessionType: "inputs-gen",
    thinkingTask: "inputs",
    resultFile: "result.txt",
    resultFileFallback: "firstNonEmptyFile",
    initialProgressMessage: `Generating ${label}…`,
    debugPayload: (b) => ({
      inputId: b.inputId,
      designBriefChars: b.designBrief.length
    }),
    onTaskResult: async (taskResult, { write }) => {
      await write(SSE_EVENT_NAMES.task_result, { result: taskResult.result.trim() });
    }
  });
});
function defaultDevCorsOrigins() {
  const origins = [];
  const base = DEFAULT_DEV_CLIENT_PORT;
  for (let i = 0; i <= 3; i += 1) {
    const port = base + i;
    origins.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
  }
  for (const legacy of [5173, 5174, 5175, 4173]) {
    origins.push(`http://localhost:${legacy}`);
  }
  return origins;
}
const DEFAULT_DEV_CORS_ORIGINS = defaultDevCorsOrigins();
function effectiveCorsOrigins() {
  const extra = env.ALLOWED_ORIGINS;
  if (extra.length === 0) return DEFAULT_DEV_CORS_ORIGINS;
  return extra;
}
const app = new Hono().basePath("/api");
const BODY_LIMIT_BYTES = 2 * 1024 * 1024;
app.use(
  "*",
  bodyLimit({
    maxSize: BODY_LIMIT_BYTES,
    onError: (c) => apiJsonError(c, 413, "Request body too large")
  })
);
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      return effectiveCorsOrigins().includes(origin) ? origin : null;
    }
  })
);
app.get("/health", (c) => c.json({ ok: true }));
app.route("/config", configRoute);
app.route("/provider-status", providerStatus);
app.route("/incubate", incubate);
app.route("/generate", generate);
app.route("/models", models);
app.route("/logs", logs);
app.route("/design-system", designSystem);
app.route("/hypothesis", hypothesis);
app.route("/preview", preview);
app.route("/inputs", inputsGenerate);
const runtime = "nodejs";
const maxDuration = 800;
const vercelEntry = handle(app);
export {
  vercelEntry as default,
  maxDuration,
  runtime
};
