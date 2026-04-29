/**
 * Agent tool registry.
 *
 * Groups Pi tool definitions by app capability while preserving the exact
 * model-facing order used before this boundary existed.
 */
import type { Bash } from 'just-bash';
import type { TodoItem } from '../../src/types/provider.ts';
import type { SkillCatalogEntry } from '../lib/skill-schema.ts';
import { createSandboxBashTool } from './pi-bash-tool.ts';
import {
  createTodoWriteTool,
  createUseSkillTool,
  createValidateHtmlTool,
  createValidateJsTool,
} from './pi-app-tools.ts';
import { createVirtualPiCodingTools } from './pi-sdk/virtual-tools.ts';

type VirtualFileToolDefinition = ReturnType<typeof createVirtualPiCodingTools>[number];
type BashToolDefinition = ReturnType<typeof createSandboxBashTool>;
type TodoToolDefinition = ReturnType<typeof createTodoWriteTool>;
type UseSkillToolDefinition = ReturnType<typeof createUseSkillTool>;
type ValidateJsToolDefinition = ReturnType<typeof createValidateJsTool>;
type ValidateHtmlToolDefinition = ReturnType<typeof createValidateHtmlTool>;
type AgentToolDefinition =
  | VirtualFileToolDefinition
  | BashToolDefinition
  | TodoToolDefinition
  | UseSkillToolDefinition
  | ValidateJsToolDefinition
  | ValidateHtmlToolDefinition;

export interface AgentToolRegistryInput {
  bash: Bash;
  todoState: { current: TodoItem[] };
  skillCatalog: SkillCatalogEntry[];
  onDesignFile: (path: string, content: string) => void;
  onTodos: (todos: TodoItem[]) => void;
  onSkillActivated: (payload: { key: string; name: string; description: string }) => void;
}

export interface AgentToolGroups {
  virtualFileTools: VirtualFileToolDefinition[];
  bashTool: BashToolDefinition;
  appTools: Array<TodoToolDefinition | UseSkillToolDefinition>;
  validationTools: Array<ValidateJsToolDefinition | ValidateHtmlToolDefinition>;
}

export function buildAgentToolGroups(input: AgentToolRegistryInput): AgentToolGroups {
  return {
    virtualFileTools: createVirtualPiCodingTools(input.bash, input.onDesignFile),
    bashTool: createSandboxBashTool(input.bash, input.onDesignFile),
    appTools: [
      createTodoWriteTool(input.todoState, input.onTodos),
      createUseSkillTool(input.skillCatalog, input.onSkillActivated),
    ],
    validationTools: [
      createValidateJsTool(input.bash),
      createValidateHtmlTool(input.bash),
    ],
  };
}

export function flattenAgentToolGroups(groups: AgentToolGroups): AgentToolDefinition[] {
  return [
    ...groups.virtualFileTools,
    groups.bashTool,
    ...groups.appTools,
    ...groups.validationTools,
  ];
}

export function buildAgentTools(input: AgentToolRegistryInput): AgentToolDefinition[] {
  return flattenAgentToolGroups(buildAgentToolGroups(input));
}
