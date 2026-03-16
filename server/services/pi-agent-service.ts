/**
 * PI Agent adapter — single import boundary for @mariozechner/pi-agent-core.
 *
 * This is the ONLY file in the codebase that imports from @mariozechner/*.
 * PI is pre-1.0 (pinned at ~0.58.x). When upgrading, TypeScript will surface
 * any breaking API changes here in isolation.
 */
import { Agent } from '@mariozechner/pi-agent-core';
import type { AgentTool, AgentMessage } from '@mariozechner/pi-agent-core';
import type { Model } from '@mariozechner/pi-ai';
import { Type, type Static } from '@sinclair/typebox';
import { env } from '../env.ts';

// ── Public API types (app-domain only, no PI types cross this boundary) ───────

export interface AgentRunParams {
  systemPrompt: string;
  userPrompt: string;
  providerId: string;
  modelId: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
  signal?: AbortSignal;
}

export type AgentRunEventType = 'activity' | 'progress' | 'code' | 'error' | 'file' | 'plan';

export type AgentRunEvent =
  | { type: 'activity' | 'progress' | 'code' | 'error'; payload: string }
  | { type: 'file'; path: string; content: string }
  | { type: 'plan'; files: string[] };

// ── Internal helpers ──────────────────────────────────────────────────────────

const ZEROED_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/**
 * Construct a PI Model object for the given provider/model pair.
 * Uses manual construction (NOT getModel() from PI's curated registry)
 * so any OpenRouter or LM Studio model ID works without PI needing to know it.
 */
function buildModel(providerId: string, modelId: string): Model<'openai-completions'> {
  if (providerId === 'lmstudio') {
    return {
      id: modelId,
      name: modelId,
      api: 'openai-completions',
      provider: 'lmstudio',
      baseUrl: `${env.LMSTUDIO_URL}/v1`,
      reasoning: false,
      input: ['text'],
      cost: ZEROED_COST,
      contextWindow: 131072,
      maxTokens: 16384,
    };
  }

  // Default: OpenRouter.
  // PI recognizes provider='openrouter' and resolves OPENROUTER_API_KEY from env automatically,
  // so no explicit Authorization header is needed here.
  return {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: 'openrouter',
    baseUrl: `${env.OPENROUTER_BASE_URL}/api/v1`,
    reasoning: false,
    input: ['text'],
    cost: ZEROED_COST,
    contextWindow: 131072,
    maxTokens: 16384,
  };
}

const writeFileSchema = Type.Object({
  path: Type.String({ description: 'File path relative to project root (e.g. index.html, styles.css, app.js).' }),
  content: Type.String({ description: 'Complete file content.' }),
  reasoning: Type.Optional(
    Type.String({ description: 'Brief note on key decisions for this file (optional).' }),
  ),
});

type WriteFileParams = Static<typeof writeFileSchema>;

const readFileSchema = Type.Object({
  path: Type.String({ description: 'File path to read.' }),
});

type ReadFileParams = Static<typeof readFileSchema>;

function makeWriteFileTool(
  virtualFS: Map<string, string>,
  onFile: (path: string, content: string) => void,
): AgentTool<typeof writeFileSchema> {
  return {
    name: 'write_file',
    label: 'write_file',
    description:
      'Write or overwrite a file in the project. Each call updates the live preview immediately. ' +
      'Use this to build the project file by file — index.html first, then styles.css, then app.js. ' +
      'The last version of each file you write becomes the final design.',
    parameters: writeFileSchema,
    execute: async (_toolCallId, params: WriteFileParams) => {
      virtualFS.set(params.path, params.content);
      onFile(params.path, params.content);
      return {
        content: [{ type: 'text' as const, text: `File written: ${params.path}. Preview updated.` }],
        details: null,
      };
    },
  };
}

const planFilesSchema = Type.Object({
  files: Type.Array(Type.String(), {
    description: 'Ordered list of file paths you plan to create (e.g. ["index.html", "styles.css", "app.js"]).',
  }),
  reasoning: Type.Optional(
    Type.String({ description: 'Brief note on the project structure and why (optional).' }),
  ),
});

type PlanFilesParams = Static<typeof planFilesSchema>;

function makePlanFilesTool(
  onPlan: (files: string[]) => void,
): AgentTool<typeof planFilesSchema> {
  return {
    name: 'plan_files',
    label: 'plan_files',
    description:
      'Declare the files you plan to create before writing any of them. ' +
      'Call this once at the start. The user sees this plan immediately so they know what to expect.',
    parameters: planFilesSchema,
    execute: async (_toolCallId, params: PlanFilesParams) => {
      onPlan(params.files);
      return {
        content: [{ type: 'text' as const, text: `Plan registered: ${params.files.join(', ')}. Now write each file with write_file.` }],
        details: null,
      };
    },
  };
}

function makeReadFileTool(virtualFS: Map<string, string>): AgentTool<typeof readFileSchema> {
  return {
    name: 'read_file',
    label: 'read_file',
    description: 'Read a file you previously wrote to review or verify it before refining.',
    parameters: readFileSchema,
    execute: async (_toolCallId, params: ReadFileParams) => {
      const content = virtualFS.get(params.path);
      return {
        content: [{ type: 'text' as const, text: content ?? `File not found: ${params.path}` }],
        details: null,
      };
    },
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run the PI agentic design loop.
 *
 * Streams events back via `onEvent` as the agent reasons and generates.
 * Resolves when the agent finishes (or errors). Never throws — errors are
 * emitted as `{ type: 'error' }` events.
 */
export async function runDesignAgent(
  params: AgentRunParams,
  onEvent: (event: AgentRunEvent) => void | Promise<void>,
): Promise<void> {
  await onEvent({ type: 'progress', payload: 'Starting agentic generation...' });

  const virtualFS = new Map<string, string>();

  const model = buildModel(params.providerId, params.modelId);
  const planTool = makePlanFilesTool((files) => {
    void onEvent({ type: 'plan', files });
  });
  const writeTool = makeWriteFileTool(virtualFS, (path, content) => {
    void onEvent({ type: 'file', path, content });
  });
  const readTool = makeReadFileTool(virtualFS);

  const KEEP_RECENT = 20;
  const COMPACT_THRESHOLD = 30;

  const agent = new Agent({
    initialState: {
      systemPrompt: params.systemPrompt,
      model,
      thinkingLevel: params.thinkingLevel ?? 'off',
      tools: [planTool, writeTool, readTool],
    },
    transformContext: async (messages) => {
      if (messages.length <= COMPACT_THRESHOLD) return messages;

      const first = messages[0];
      const recent = messages.slice(-KEEP_RECENT);
      const dropped = messages.length - 1 - KEEP_RECENT;
      const filesWritten = [...virtualFS.keys()];

      const summary: AgentMessage = {
        role: 'user',
        content:
          `[Context window managed: ${dropped} earlier turns summarized.]\n` +
          `Files written so far: ${filesWritten.length > 0 ? filesWritten.join(', ') : 'none yet'}.\n` +
          `Continue the design work from your current state.`,
        timestamp: Date.now(),
      };

      return [first, summary, ...recent];
    },
  });

  // Wire abort signal
  if (params.signal) {
    params.signal.addEventListener('abort', () => agent.abort());
  }

  agent.subscribe((event) => {
    if (params.signal?.aborted) return;

    if (event.type === 'turn_start') {
      void onEvent({ type: 'progress', payload: 'Thinking...' });
    } else if (event.type === 'message_update') {
      const e = event.assistantMessageEvent;
      if (e.type === 'text_delta' && e.delta) {
        void onEvent({ type: 'activity', payload: e.delta });
      } else if (e.type === 'thinking_delta' && e.delta) {
        void onEvent({ type: 'activity', payload: e.delta });
      }
    } else if (event.type === 'tool_execution_start' && event.toolName === 'write_file') {
      const path = (event.args as { path?: string })?.path ?? 'file';
      void onEvent({ type: 'progress', payload: `Writing ${path}...` });
    }
  });

  try {
    await agent.prompt(params.userPrompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await onEvent({ type: 'error', payload: `Agent error: ${message}` });
    return;
  }

  if (virtualFS.size === 0 && !params.signal?.aborted) {
    await onEvent({
      type: 'error',
      payload:
        'Agent completed without calling write_file. Try a model that supports tool use.',
    });
  }
}
