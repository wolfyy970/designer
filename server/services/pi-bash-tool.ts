/**
 * Pi SDK `bash` tool backed by just-bash (virtual in-memory project).
 */
import { Type } from '@sinclair/typebox';
import type { Bash } from 'just-bash';
import type { ExtensionContext, ToolDefinition } from './pi-sdk/types.ts';
import { snapshotDesignFiles } from './agent-bash-sandbox.ts';

const MAX_TOOL_CHARS = 51_200;

const bashParams = Type.Object({
  command: Type.String({
    description:
      'Shell command in the sandbox (cwd is the project root). Prefer read/write/edit tools for files; use bash for pipelines, npm, or utilities.',
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
      'Run a shell command in the isolated project at /home/user/project (your cwd). ' +
      'For creating or editing design files, prefer the `write` and `edit` tools (SEARCH/REPLACE); use `read` instead of `cat`. ' +
      'Use bash for npm, multi-step shell pipelines, or when no dedicated tool fits. ' +
      '`skills/` is read-only — do not modify it.',
    promptSnippet: 'bash: sandbox shell (prefer write/edit/read tools for files)',
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
