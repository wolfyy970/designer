/**
 * Pi SDK `bash` tool backed by just-bash (virtual in-memory project).
 *
 * `promptSnippet` is omitted on purpose: Pi only injects it when no `customPrompt` is set;
 * we use `designer-agentic-system` as the custom prompt, so snippets never reach the model.
 */
import { Type } from '@sinclair/typebox';
import type { Bash } from 'just-bash';
import type { ExtensionContext, ToolDefinition } from './pi-sdk/types.ts';
import { SANDBOX_PROJECT_ROOT, snapshotDesignFiles } from './agent-bash-sandbox.ts';

const MAX_TOOL_CHARS = 51_200;

const bashParams = Type.Object({
  command: Type.String({
    description:
      'Shell command in the just-bash sandbox (cwd is the project root). No package managers or host binaries — only built-in commands (e.g. rg, grep, sed, awk, jq, cat, find). Prefer read/write/edit tools for files; use bash for text pipelines or when no dedicated tool fits.',
  }),
});

export function createSandboxBashTool(
  bash: Bash,
  onFile: (path: string, content: string) => void,
): ToolDefinition {
  return {
    name: 'bash',
    label: 'bash',
    description:
      `Run a shell command in the just-bash virtual shell at ${SANDBOX_PROJECT_ROOT} (your cwd). ` +
      'This is not a full Linux machine: no npm, node, python, or external binaries — only just-bash built-ins (text tools like rg, grep, sed, awk, jq, pipes). ' +
      'For creating or editing design files, prefer the `write` and `edit` tools; use `read` instead of `cat`. ' +
      'Use bash for multi-step text pipelines or utilities when no dedicated tool fits.',
    parameters: bashParams,
    async execute(_toolCallId, params, signal, _onUpdate, _ctx: ExtensionContext) {
      const { command } = params as { command: string };
      const before = await snapshotDesignFiles(bash);
      const result = await bash.exec(command, { signal: signal ?? undefined });
      const after = await snapshotDesignFiles(bash);

      for (const [rel, content] of after) {
        if (before.get(rel) !== content) {
          onFile(rel, content);
        }
      }

      const merged = [result.stdout, result.stderr].filter(Boolean).join('\n');
      const prefix = result.exitCode !== 0 ? `[exit ${result.exitCode}]\n` : '';
      const body = merged || (result.exitCode !== 0 ? '(no stdout/stderr)' : '(no output)');
      const full = prefix + body;
      const text =
        full.length > MAX_TOOL_CHARS
          ? `${full.slice(0, MAX_TOOL_CHARS)}\n[Output truncated at ${MAX_TOOL_CHARS} characters]`
          : full;

      return {
        content: [{ type: 'text', text }],
        details: null,
      };
    },
  };
}
