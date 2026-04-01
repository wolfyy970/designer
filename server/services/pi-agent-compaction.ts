/**
 * PI agent context compaction — model construction + LLM/fallback summarization.
 */
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { Model } from '@mariozechner/pi-ai';
import { env } from '../env.ts';
import { getProvider } from './providers/registry.ts';
import { loggedGenerateChat } from '../lib/llm-call-logger.ts';
import type { TodoItem } from '../../src/types/provider.ts';
import type { WorkspaceFileSnapshot } from './virtual-workspace.ts';

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high';

const ZEROED_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/**
 * Construct a PI Model object for the given provider/model pair.
 */
export function buildModel(
  providerId: string,
  modelId: string,
  thinkingLevel?: ThinkingLevel,
): Model<'openai-completions'> {
  const reasoning = !!thinkingLevel && thinkingLevel !== 'off';

  if (providerId === 'lmstudio') {
    return {
      id: modelId,
      name: modelId,
      api: 'openai-completions',
      provider: 'lmstudio',
      baseUrl: `${env.LMSTUDIO_URL}/v1`,
      reasoning,
      input: ['text'],
      cost: ZEROED_COST,
      contextWindow: 131072,
      maxTokens: 16384,
    };
  }

  return {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: 'openrouter',
    baseUrl: `${env.OPENROUTER_BASE_URL}/api/v1`,
    reasoning,
    input: ['text'],
    cost: ZEROED_COST,
    contextWindow: 131072,
    maxTokens: 16384,
  };
}

function formatFileOpsXml(snapshot: WorkspaceFileSnapshot): string {
  const parts: string[] = [];
  if (snapshot.readFiles.length > 0) {
    parts.push(`<read-files>\n${snapshot.readFiles.join('\n')}\n</read-files>`);
  }
  if (snapshot.modifiedFiles.length > 0) {
    parts.push(`<modified-files>\n${snapshot.modifiedFiles.join('\n')}\n</modified-files>`);
  }
  if (snapshot.allPaths.length > 0 && parts.length === 0) {
    parts.push(`<workspace-paths>\n${snapshot.allPaths.join('\n')}\n</workspace-paths>`);
  }
  return parts.length > 0 ? `\n\n${parts.join('\n\n')}` : '';
}

export const COMPACTION_SYSTEM_PROMPT = `You are summarizing a design agent session for context window management.

Output a structured checkpoint another model will use to continue seamlessly.

Use this EXACT section structure (markdown headings):

## Goal
What design hypothesis or user intent is being implemented (one short paragraph).

## Constraints & Preferences
Product rules that matter (e.g. static local web artifact with a clear HTML entry such as index.html, flexible multi-file layout, relative local asset links only, no CDN unless explicitly allowed).

## Progress
### Done
- [x] substantive milestones completed

### In Progress
- [ ] what is being worked on now

### Blocked
- issues, if any (or "(none)")

## Key Decisions
- Bullet list: palette, typography, layout, motion, content choices tied to the hypothesis.

## Next Steps
1. Ordered list of what to do next (concrete, tool-oriented).

## Critical Context
- Anything that must not be lost: exact error messages, evaluator feedback, or risky edge cases.
- Short note on important file roles only if essential (paths only, not full contents).

Be specific. Do NOT continue the conversation. Do NOT answer questions from the transcript.`;

/**
 * Fallback summary when LLM compaction is unavailable or fails.
 */
export function buildFallbackSummary(
  droppedCount: number,
  snapshot: WorkspaceFileSnapshot,
  todos?: TodoItem[],
): string {
  const modified = snapshot.modifiedFiles.length > 0 ? snapshot.modifiedFiles.join(', ') : 'none yet';
  const read = snapshot.readFiles.length > 0 ? snapshot.readFiles.join(', ') : 'none';
  const base =
    `[Context compacted: ${droppedCount} earlier messages summarized.]\n` +
    `Modified design files: ${modified}.\n` +
    `Files read (not modified): ${read}.\n` +
    `Continue using read / grep / edit / write as needed.`;

  if (!todos || todos.length === 0) return base + formatFileOpsXml(snapshot);

  const todoAppendix =
    '\n\n[Current todo list at time of compaction]\n' +
    todos
      .map((t) => {
        const icon = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '●' : '○';
        return `${icon} [${t.status}] ${t.task}`;
      })
      .join('\n');

  return base + todoAppendix + formatFileOpsXml(snapshot);
}

export interface CompactWithLLMOptions {
  extraContext?: string;
  snapshot?: WorkspaceFileSnapshot;
}

/**
 * Calls the provider to produce a structured LLM summary of dropped messages.
 */
export async function compactWithLLM(
  messages: AgentMessage[],
  providerId: string,
  modelId: string,
  options?: CompactWithLLMOptions,
): Promise<string> {
  const provider = getProvider(providerId);
  const snapshot: WorkspaceFileSnapshot = options?.snapshot ?? {
    allPaths: [],
    readFiles: [],
    modifiedFiles: [],
  };

  if (!provider) return buildFallbackSummary(messages.length, snapshot);

  const MAX_MSG_CHARS = 1500;
  const transcript = messages
    .map((m) => {
      const role = String(m.role).toUpperCase();
      const raw = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      const text = raw.length > MAX_MSG_CHARS ? raw.slice(0, MAX_MSG_CHARS) + '…' : raw;
      return `[${role}]\n${text}`;
    })
    .join('\n\n');

  const fileBlock = formatFileOpsXml(snapshot);
  const userBody =
    `Summarize this design session transcript:\n\n${transcript}` +
    fileBlock +
    (options?.extraContext ? `\n\n${options.extraContext}` : '');

  try {
    const response = await loggedGenerateChat(
      provider,
      providerId,
      [
        {
          role: 'system',
          content: COMPACTION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: userBody,
        },
      ],
      { model: modelId },
      { source: 'agentCompaction', phase: 'Context window compaction' },
    );
    return response.raw;
  } catch {
    return buildFallbackSummary(messages.length, snapshot);
  }
}
