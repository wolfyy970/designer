/**
 * Changelog / aggregate disk writes for a meta-harness candidate directory.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MetaHarnessCliArgs } from './config.ts';
import type { MetaHarnessMode } from './modes.ts';
import type { SimplifiedMetaHarnessTestCase } from './test-case-hydrator.ts';
import { ARTIFACT } from './constants.ts';
import { TestCaseSummarySchema } from './schemas.ts';

export async function writeCandidateChangelogAndAggregate(options: {
  candidateDir: string;
  candidateId: number;
  meanScore: number | null;
  scores: number[];
  testFiles: string[];
  testResultsDir: string;
  proposalMd: string;
  promptOverrides: Record<string, string>;
  args: MetaHarnessCliArgs;
  aggregateIteration: number;
  iterationLine: string;
  includeProposerSection: boolean;
}): Promise<void> {
  const {
    candidateDir,
    candidateId,
    meanScore,
    scores,
    testFiles,
    testResultsDir,
    proposalMd,
    promptOverrides,
    args,
    aggregateIteration,
    iterationLine,
    includeProposerSection,
  } = options;

  const changelogLines: string[] = [`# candidate-${candidateId}\n`];
  changelogLines.push(`**Iteration:** ${iterationLine}`);
  changelogLines.push(
    `**Mean score:** ${meanScore != null ? meanScore.toFixed(2) : 'n/a'} (${scores.length} test cases)`,
  );
  if (includeProposerSection && proposalMd && !args.evalOnly) {
    changelogLines.push(`\n## What the proposer changed\n\n${proposalMd}`);
  } else if (proposalMd && !includeProposerSection) {
    changelogLines.push(`\n## Notes\n\n${proposalMd}`);
  }
  const overrideKeys = Object.keys(promptOverrides);
  if (overrideKeys.length) {
    changelogLines.push(
      `\n## Prompt overrides applied\n\n${overrideKeys.map((k) => `- \`${k}\``).join('\n')}`,
    );
  }
  changelogLines.push(`\n## Per-test results\n`);
  changelogLines.push('| Test case | Score | Stop reason |');
  changelogLines.push('|-----------|-------|-------------|');
  for (const tf of testFiles) {
    const tcName = path.basename(tf, '.json');
    const sumPath = path.join(testResultsDir, tcName, ARTIFACT.summaryJson);
    try {
      const raw = JSON.parse(await readFile(sumPath, 'utf8')) as unknown;
      const s = TestCaseSummarySchema.safeParse(raw);
      const scoreStr =
        s.success && s.data.overallScore != null && Number.isFinite(s.data.overallScore)
          ? Number(s.data.overallScore).toFixed(2)
          : 'err';
      const stopStr = s.success ? (s.data.stopReason ?? '?') : '?';
      changelogLines.push(`| ${tcName} | ${scoreStr} | ${stopStr} |`);
    } catch {
      changelogLines.push(`| ${tcName} | err | ? |`);
    }
  }
  changelogLines.push('');
  await writeFile(path.join(candidateDir, ARTIFACT.changelogMd), changelogLines.join('\n'), 'utf8');

  await writeFile(
    path.join(candidateDir, ARTIFACT.aggregateJson),
    `${JSON.stringify({ candidateId, meanScore, scores, iteration: aggregateIteration }, null, 2)}\n`,
    'utf8',
  );
}

export function validateTestCaseShapeForMode(
  mode: MetaHarnessMode,
  data: SimplifiedMetaHarnessTestCase,
  filePath: string,
): string | null {
  if (mode === 'design' && !data.strategy) {
    return `${filePath}: design mode requires a "strategy" object in the test case JSON`;
  }
  if (mode === 'inputs') {
    const brief =
      typeof data.spec.sections['design-brief'] === 'string'
        ? data.spec.sections['design-brief']
        : (data.spec.sections['design-brief'] as { content?: string } | undefined)?.content ?? '';
    if (!brief.trim()) {
      return `${filePath}: inputs mode requires a non-empty "design-brief" in spec.sections`;
    }
  }
  return null;
}
