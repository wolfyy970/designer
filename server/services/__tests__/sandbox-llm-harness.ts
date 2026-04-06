/**
 * Opt-in LLM harness for sandbox tool integration tests ({@link sandbox-llm-tools.test.ts}).
 * OpenRouter + native tool loop; does not use the full Pi coding agent.
 */
import { fetchChatCompletion } from '../../../src/lib/provider-fetch.ts';
import { buildChatRequestFromMessages } from '../../lib/provider-helpers.ts';
import { env } from '../../env.ts';
import type { SkillCatalogEntry } from '../../lib/skill-schema.ts';
import type { ChatMessage, TodoItem } from '../../../src/types/provider.ts';
import type { ToolDefinition } from '../pi-sdk/types.ts';
import {
  createAgentBashSandbox,
  extractDesignFiles,
  SANDBOX_PROJECT_ROOT,
} from '../agent-bash-sandbox.ts';
import { createSandboxBashTool } from '../pi-bash-tool.ts';
import {
  createTodoWriteTool,
  createUseSkillTool,
  createValidateHtmlTool,
  createValidateJsTool,
} from '../pi-app-tools.ts';
import { createVirtualPiCodingTools } from '../pi-sdk/virtual-tools.ts';
import type { ExtensionContext } from '../pi-sdk/types.ts';

const ext = {} as ExtensionContext;

export type SandboxToolCallRecord = {
  name: string;
  /** Parsed tool arguments */
  args: Record<string, unknown>;
  /** Text sent back to the model (all `text` parts joined; not capped — mirrors production tool results). */
  resultPreview: string;
};

function piToolsToOpenAi(tools: ToolDefinition[]): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: JSON.parse(JSON.stringify(t.parameters)) as Record<string, unknown>,
    },
  }));
}

function getToolMap(tools: ToolDefinition[]): Map<string, ToolDefinition> {
  return new Map(tools.map((x) => [x.name, x]));
}

/**
 * Full text for the model's `tool` message. Do **not** truncate here: Pi's `read` tool already
 * caps output (~50KB / line limit) and appends `Use offset=… to continue` at the end — a short
 * slice would hide that hint and break pagination stress tests (and misrepresent production).
 */
function firstTextFromToolResult(res: { content: { type: string; text?: string }[] }): string {
  const parts: string[] = [];
  for (const c of res.content ?? []) {
    if (c?.type === 'text' && 'text' in c) parts.push(String(c.text ?? ''));
  }
  return parts.length > 0 ? parts.join('\n') : '';
}

type OpenAiChatMessage = Record<string, unknown>;

/**
 * Runs up to `maxToolRounds` model turns with tool execution against the real just-bash sandbox.
 */
export async function runSandboxToolConversation(options: {
  seedFiles: Record<string, string>;
  skillCatalog?: SkillCatalogEntry[];
  systemPrompt: string;
  userPrompt: string;
  /** OpenRouter model id */
  model?: string;
  maxToolRounds?: number;
}): Promise<{
  toolCalls: SandboxToolCallRecord[];
  finalMessageText: string;
  files: Record<string, string>;
}> {
  const sandboxKey = env.OPENROUTER_API_KEY_TESTS.trim();
  if (!sandboxKey) {
    throw new Error(
      'Set OPENROUTER_API_KEY_TESTS in .env.local — a dedicated OpenRouter key for Vitest sandbox LLM tests only (not OPENROUTER_API_KEY).',
    );
  }

  const bash = createAgentBashSandbox({ seedFiles: options.seedFiles });
  const todoState: { current: TodoItem[] } = { current: [] };
  const virtual = createVirtualPiCodingTools(bash, () => {});
  const bashTool = createSandboxBashTool(bash, () => {});
  const todoTool = createTodoWriteTool(todoState, () => {});
  const useSkill = createUseSkillTool(options.skillCatalog ?? [], () => {});
  const vjs = createValidateJsTool(bash);
  const vhtml = createValidateHtmlTool(bash);
  const tools = [
    ...virtual,
    bashTool,
    todoTool,
    useSkill,
    vjs,
    vhtml,
  ] as ToolDefinition[];
  const byName = getToolMap(tools);
  const openAiTools = piToolsToOpenAi(tools);

  const messages: OpenAiChatMessage[] = [
    { role: 'system', content: options.systemPrompt },
    { role: 'user', content: options.userPrompt },
  ];

  const toolCalls: SandboxToolCallRecord[] = [];
  const model = options.model ?? 'openai/gpt-4o-mini';
  const maxRounds = options.maxToolRounds ?? 12;

  for (let r = 0; r < maxRounds; r++) {
    const body = buildChatRequestFromMessages(model, messages as unknown as ChatMessage[], {
      tools: openAiTools,
      tool_choice: 'auto',
    }, 2048);

    const data = await fetchChatCompletion(
      `${env.OPENROUTER_BASE_URL}/api/v1/chat/completions`,
      body,
      {
        401: 'Invalid OpenRouter API key.',
        429: 'Rate limit exceeded.',
      },
      'OpenRouter',
      { Authorization: `Bearer ${sandboxKey}` },
    );

    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const choice = choices?.[0];
    const message = choice?.message as Record<string, unknown> | undefined;
    const toolCallsRaw = message?.tool_calls as Array<Record<string, unknown>> | undefined;
    const content = message?.content;

    if (toolCallsRaw && toolCallsRaw.length > 0) {
      const assistantMsg: OpenAiChatMessage = {
        role: 'assistant',
        content: typeof content === 'string' ? content : null,
        tool_calls: toolCallsRaw,
      };
      messages.push(assistantMsg);

      for (const tc of toolCallsRaw) {
        const fn = tc.function as Record<string, unknown> | undefined;
        const name = fn?.name as string;
        const argStr = (fn?.arguments as string) ?? '{}';
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(argStr) as Record<string, unknown>;
        } catch {
          args = {};
        }
        const def = byName.get(name);
        let resultPreview = '(no tool)';
        if (def) {
          try {
            // Mirror Pi agent-loop (`pi-agent-core`): `prepareArguments` runs before `execute`.
            // The built-in **edit** tool folds top-level `oldText`/`newText` into `edits[]` here.
            let execArgs: Record<string, unknown> = args;
            const prepare = def.prepareArguments;
            if (typeof prepare === 'function') {
              const prepared = prepare(args) as Record<string, unknown>;
              if (prepared !== args) execArgs = prepared;
            }
            const execResult = await def.execute(
              (tc.id as string) ?? 'tc',
              execArgs as never,
              undefined,
              undefined,
              ext,
            );
            resultPreview = firstTextFromToolResult(execResult);
          } catch (err) {
            // Pi agent-core catches tool errors and feeds them back so the model
            // can self-correct (e.g. edit duplicate oldText → retry with context).
            resultPreview = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
        toolCalls.push({ name, args, resultPreview });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id as string,
          content: resultPreview,
        });
      }
      continue;
    }

    const finalText =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? (content as { text?: string }[])
              .map((p) => (typeof p?.text === 'string' ? p.text : ''))
              .join('')
          : '';
    const files = await extractDesignFiles(bash);
    return { toolCalls, finalMessageText: finalText, files };
  }

  const files = await extractDesignFiles(bash);
  return { toolCalls, finalMessageText: '', files };
}

export const SANDBOX_LLM_SYSTEM_PREFIX =
  `You are a coding agent working only inside the virtual project root ${SANDBOX_PROJECT_ROOT}. ` +
  'Use the provided tools; do not invent file paths outside the project. ' +
  'Prefer dedicated file tools over bash when they apply. ' +
  'For **edit**, use JSON fields **oldText** and **newText** inside **edits**: `[{ "oldText": "…", "newText": "…" }]` (or a single top-level oldText/newText pair). ' +
  'Each oldText must match the file **exactly** (same whitespace) and occur **once**. ' +
  'You **must** **read** (or **write**) a file before **edit** on that file; after each successful **edit**, **read** again before another **edit** on the same file. ' +
  'Include enough lines in oldText so it is unique (prefer full CSS rule blocks when hex repeats).';
