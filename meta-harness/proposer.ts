/**
 * OpenRouter tool-calling agent that proposes harness edits (skills, system prompt, rubric weights, test cases).
 */
import path from 'node:path';
import { normalizeError } from '../src/lib/error-utils.ts';
import { debugMetaHarness } from './debug-log.ts';
import type { EvaluatorRubricId } from '../src/types/evaluation.ts';
import { EVALUATOR_RUBRIC_IDS } from '../src/types/evaluation.ts';
import { resolveRubricWeights } from '../server/lib/evaluation-revision-gate.ts';
import type { MetaHarnessMode } from './modes.ts';
import { repoRoot } from './paths.ts';
import { fetchOpenRouterChat } from './openrouter-client.ts';
import {
  formatRubricWeightsContext,
  loadCurrentSkills,
  loadPreviousSessionBests,
  loadPromptBodies,
  loadRichCandidateHistory,
  MODE_PROMPT_KEYS,
} from './proposer-context.ts';
import { openRouterToolsForMode, systemPromptForMode } from './proposer-prompts.ts';
import { dispatchTool, type ProposerContext } from './proposer-tools.ts';

type ProposerResult = {
  reasoning: string;
  /** Effective rubric blend for agentic eval (omitted when unchanged). */
  rubricWeights?: Record<EvaluatorRubricId, number>;
  /** How many OpenRouter round-trips the proposer used (out of maxToolRounds). */
  roundsUsed: number;
  /** Ordered log of tool calls made during this proposer turn. */
  toolLog: Array<{ round: number; tool: string; summary: string }>;
};

export async function runMetaHarnessProposer(options: {
  apiKey: string;
  /** Same base as meta-harness config (e.g. http://127.0.0.1:4731/api) — used to load live prompts. */
  apiBaseUrl: string;
  model: string;
  mode: MetaHarnessMode;
  metaHarnessDir: string;
  /** This run's session dir: `meta-harness/history/session-…/` (candidates live here). */
  sessionHistoryDir: string;
  /** Parent of all `session-*` dirs — for cross-session best scores only. */
  historyRootDir: string;
  /** Basename of `sessionHistoryDir` (excluded from previous-session scan). */
  currentSessionFolderName: string;
  evalRunsBaseDir: string;
  candidateLabel: string;
  maxToolRounds: number;
  signal?: AbortSignal;
  /** Per round-trip; default from config / constants */
  openRouterChatTimeoutMs?: number;
  onToolCall?: (round: number, toolName: string, summary: string) => void;
}): Promise<ProposerResult> {
  const root = repoRoot();
  const ctx: ProposerContext = {
    root,
    metaHarnessDir: options.metaHarnessDir,
    skillsDir: path.join(root, 'skills'),
    testCasesDir: path.join(options.metaHarnessDir, 'test-cases'),
    evalRunsBaseDir: options.evalRunsBaseDir,
    rubricWeightPatch: {},
    submitted: null,
    mode: options.mode,
    skillsMutated: false,
  };

  const [promptBodiesSection, historySection, prevSessionsSection, skillsSection, rubricWeightsSection] =
    await Promise.all([
      loadPromptBodies(MODE_PROMPT_KEYS[options.mode]),
      loadRichCandidateHistory(options.sessionHistoryDir),
      loadPreviousSessionBests(options.historyRootDir, options.currentSessionFolderName),
      loadCurrentSkills(path.join(repoRoot(), 'skills')),
      options.mode === 'incubate' || options.mode === 'inputs'
        ? Promise.resolve('')
        : formatRubricWeightsContext(options.apiBaseUrl),
    ]);

  const contextBlock = [
    promptBodiesSection,
    '',
    historySection,
    ...(prevSessionsSection ? ['', prevSessionsSection] : []),
    ...(skillsSection ? ['', skillsSection] : []),
    ...(options.mode === 'incubate' || options.mode === 'inputs' ? [] : ['', rubricWeightsSection]),
  ].join('\n');

  const userBrief = [
    `Mode: ${options.mode}`,
    `This turn: ${options.candidateLabel}`,
    `Tool budget: at most ${options.maxToolRounds} round-trips. Reserve the last 2 for submit_candidate.`,
    `Eval-run files (for deep-dive only): ${options.evalRunsBaseDir}`,
    '',
    '---',
    contextBlock,
    '---',
    '',
    'Based on the history above, decide **refine-on-leader** vs **explore** (see system prompt), make one focused change using your mode’s edit surfaces, then call submit_candidate.',
  ].join('\n');

  const tools = openRouterToolsForMode(options.mode);
  const messages: Record<string, unknown>[] = [
    { role: 'system', content: systemPromptForMode(options.mode) },
    { role: 'user', content: userBrief },
  ];

  let lastRound = 0;
  const toolLog: Array<{ round: number; tool: string; summary: string }> = [];

  for (let round = 0; round < options.maxToolRounds; round++) {
    lastRound = round + 1;
    if (ctx.submitted) break;

    const json = await fetchOpenRouterChat({
      apiKey: options.apiKey,
      requestBody: {
        model: options.model,
        messages,
        tools,
        tool_choice: 'auto',
      },
      signal: options.signal,
      timeoutMs: options.openRouterChatTimeoutMs,
    });
    const message = json.choices[0]!.message;

    if (message.tool_calls?.length) {
      messages.push({
        role: 'assistant',
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      });
      for (const tc of message.tool_calls) {
        const tcName = tc.function?.name ?? '';
        const tcArgs = tc.function?.arguments ?? '{}';
        let argSummary = '';
        try {
          // Logging-only: tool UI snippet. Execution path validates via dispatchTool + Zod.
          const a = JSON.parse(tcArgs) as Record<string, unknown>;
          if (tcName === 'read_file' || tcName === 'list_dir') argSummary = String(a.path ?? '').slice(0, 80);
          else if (tcName === 'write_skill') argSummary = `skills/${a.key}/SKILL.md`;
          else if (tcName === 'delete_skill') argSummary = `skills/${a.key}`;
          else if (tcName === 'set_rubric_weights') {
            argSummary = EVALUATOR_RUBRIC_IDS.map((rid) => {
              const v = a[rid];
              return typeof v === 'number' && Number.isFinite(v) ? `${rid}:${v}` : '';
            })
              .filter(Boolean)
              .join(' ')
              .slice(0, 80);
          } else if (tcName === 'write_system_prompt')
            argSummary = `PROMPT.md ${String(a.body ?? '').length} chars`;
          else if (tcName === 'search') argSummary = `"${a.pattern}" in ${a.under}`;
          else if (tcName === 'add_test_case') argSummary = String(a.name ?? '');
          else if (tcName === 'submit_candidate') argSummary = String(a.reasoning ?? '').slice(0, 60);
        } catch (e) {
          debugMetaHarness('proposer tool-arg log parse skipped:', normalizeError(e));
        }
        toolLog.push({ round, tool: tcName, summary: argSummary });
        options.onToolCall?.(round, tcName, argSummary);
        const result = await dispatchTool(ctx, tcName, tcArgs);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }
      continue;
    }

    const text = typeof message.content === 'string' ? message.content.trim() : '';
    if (text) {
      messages.push({ role: 'assistant', content: text });
    }
    break;
  }

  let reasoning: string;
  if (ctx.submitted) {
    reasoning = ctx.submitted.reasoning;
  } else {
    const hasRubricTweak = Object.keys(ctx.rubricWeightPatch).length > 0;
    const hasChanges = ctx.skillsMutated || hasRubricTweak;
    if (hasChanges) {
      ctx.submitted = {
        reasoning:
          'Proposer exhausted rounds without explicit submit_candidate; queued changes are auto-committed for this candidate.',
      };
      reasoning = ctx.submitted.reasoning;
    } else {
      reasoning = `Proposer explored but made no changes in ${lastRound} round(s). Consider increasing proposerMaxToolRounds (currently ${options.maxToolRounds}) or ensure this session's history (candidate-* under the current session-* directory) holds prior eval results for the model to learn from.`;
    }
  }

  const effectiveRubricWeights =
    Object.keys(ctx.rubricWeightPatch).length > 0 ? resolveRubricWeights(ctx.rubricWeightPatch) : undefined;

  return {
    reasoning,
    ...(effectiveRubricWeights ? { rubricWeights: effectiveRubricWeights } : {}),
    roundsUsed: lastRound,
    toolLog,
  };
}
