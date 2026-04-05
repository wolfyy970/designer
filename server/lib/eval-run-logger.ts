/**
 * Structured eval-run filesystem logs for Meta-Harness-style outer loops.
 * Gated by OBSERVABILITY_LOG_DIR (via env.OBSERVABILITY_LOG_BASE_DIR).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PromptKey } from '../../src/lib/prompts/defaults.ts';
import type { AggregatedEvaluationReport, EvaluationRoundSnapshot } from '../../src/types/evaluation.ts';
import { buildAgenticSystemContext } from './build-agentic-system-context.ts';

const LOG_PROMPT_KEYS: PromptKey[] = [
  'designer-agentic-system',
  'evaluator-design-quality',
  'evaluator-strategy-fidelity',
  'evaluator-implementation',
  'designer-agentic-revision-user',
];

function stripRawTrace<T extends { rawTrace?: string }>(r: T): Omit<T, 'rawTrace'> {
  const { rawTrace: _strip, ...rest } = r;
  void _strip;
  return rest as Omit<T, 'rawTrace'>;
}

function stripAggregateForDisk(agg: AggregatedEvaluationReport): Omit<
  AggregatedEvaluationReport,
  'evaluatorTraces'
> {
  const { evaluatorTraces: _strip, ...rest } = agg;
  void _strip;
  return rest;
}

export async function writeAgenticEvalRunLog(input: {
  baseDir: string;
  runId: string;
  compiledPrompt: string;
  evaluationContext?: { hypothesis?: string; strategyName?: string };
  getPromptBody: (key: PromptKey) => Promise<string>;
  rounds: EvaluationRoundSnapshot[];
  revisionPromptByEvalRound: Map<number, string>;
  stopReason: string;
  finalAggregate: AggregatedEvaluationReport;
}): Promise<void> {
  const root = path.join(input.baseDir, 'eval-runs', input.runId);
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, 'prompts'), { recursive: true });

  const meta = {
    runId: input.runId,
    stopReason: input.stopReason,
    finalOverallScore: input.finalAggregate.overallScore,
    strategyName: input.evaluationContext?.strategyName,
    hypothesisSnippet: input.evaluationContext?.hypothesis?.slice(0, 500),
    evaluationRoundCount: input.rounds.length,
  };
  await writeFile(path.join(root, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  for (const key of LOG_PROMPT_KEYS) {
    const body = await input.getPromptBody(key);
    await writeFile(path.join(root, 'prompts', `${key}.txt`), body, 'utf8');
  }

  const ctx = await buildAgenticSystemContext({ getPromptBody: input.getPromptBody });
  for (const [relPath, content] of Object.entries(ctx.sandboxSeedFiles)) {
    if (!relPath.startsWith('skills/')) continue;
    const dest = path.join(root, relPath);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, content, 'utf8');
  }

  for (const snap of input.rounds) {
    const rd = path.join(root, `round-${snap.round}`);
    const filesRoot = path.join(rd, 'files');
    await mkdir(filesRoot, { recursive: true });
    const files = snap.files ?? {};
    for (const [p, c] of Object.entries(files)) {
      const safe = p.replace(/^\/+/, '').split('/').filter((seg) => seg !== '..' && seg !== '');
      if (safe.length === 0) continue;
      const fp = path.join(filesRoot, ...safe);
      await mkdir(path.dirname(fp), { recursive: true });
      await writeFile(fp, c, 'utf8');
    }

    const dump = async (name: 'design' | 'strategy' | 'implementation' | 'browser') => {
      const w = snap[name];
      if (!w) return;
      if (w.rawTrace != null && w.rawTrace.length > 0) {
        await writeFile(path.join(rd, `${name}.raw.txt`), w.rawTrace, 'utf8');
      }
      await writeFile(
        path.join(rd, `${name}.json`),
        `${JSON.stringify(stripRawTrace(w), null, 2)}\n`,
        'utf8',
      );
    };
    await dump('design');
    await dump('strategy');
    await dump('implementation');
    await dump('browser');

    await writeFile(
      path.join(rd, 'aggregate.json'),
      `${JSON.stringify(stripAggregateForDisk(snap.aggregate), null, 2)}\n`,
      'utf8',
    );

    const rev = input.revisionPromptByEvalRound.get(snap.round);
    if (rev) {
      await writeFile(path.join(rd, 'revision-prompt.txt'), rev, 'utf8');
    }
  }

  await writeFile(path.join(root, 'compiled-prompt.txt'), input.compiledPrompt, 'utf8');
}
