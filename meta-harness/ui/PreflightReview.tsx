import { useInput } from 'ink';
import { Box, Text } from 'ink';
import { useMemo, useState } from 'react';
import { buildUnifiedDiffLines, type DiffLine } from '../preflight-diff-lines.ts';
import type { UnpromotedSession } from '../preflight-promotion-check.ts';
import { dimText } from './theme.ts';

type ReviewItem =
  | { kind: 'prompt'; key: string; liveBody: string; winnerBody: string; fetchError?: string }
  | { kind: 'skill'; relPath: string; liveBody: string; winnerBody: string }
  | { kind: 'rubricWeights'; liveBody: string; winnerBody: string };

type SectionKind = 'prompt' | 'skill' | 'rubric';

function flattenItems(session: UnpromotedSession): ReviewItem[] {
  const prompts = [...session.stalePrompts]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(
      (p): ReviewItem => ({
        kind: 'prompt',
        key: p.key,
        liveBody: p.liveBody,
        winnerBody: p.winnerBody,
        fetchError: p.fetchError,
      }),
    );
  const skills = [...session.staleSkills]
    .sort((a, b) => a.relPath.localeCompare(b.relPath))
    .map(
      (s): ReviewItem => ({
        kind: 'skill',
        relPath: s.relPath,
        liveBody: s.liveBody,
        winnerBody: s.winnerBody,
      }),
    );
  const extra: ReviewItem[] = [];
  if (session.staleRubricWeights) {
    extra.push({
      kind: 'rubricWeights',
      liveBody: JSON.stringify(session.staleRubricWeights.liveWeights, null, 2),
      winnerBody: JSON.stringify(session.staleRubricWeights.winnerWeights, null, 2),
    });
  }
  return [...prompts, ...skills, ...extra];
}

function itemLabel(item: ReviewItem, index: number, total: number): string {
  const prefix = `[${index + 1}/${total}]`;
  if (item.kind === 'prompt') return `${prefix} Prompt: ${item.key}`;
  if (item.kind === 'skill') return `${prefix} Skill: ${item.relPath}`;
  return `${prefix} Rubric weights`;
}

function sectionAtIndex(index: number, nPrompt: number, nSkill: number): SectionKind {
  if (index < nPrompt) return 'prompt';
  if (index < nPrompt + nSkill) return 'skill';
  return 'rubric';
}

function diffLineColor(kind: DiffLine['kind']): string | undefined {
  switch (kind) {
    case 'add':
      return 'green';
    case 'remove':
      return 'red';
    case 'header':
      return 'cyan';
    case 'context':
    default:
      return dimText;
  }
}

export function PreflightReview({
  session,
  promoteOnly = false,
  onDone,
}: {
  session: UnpromotedSession;
  promoteOnly?: boolean;
  onDone: (action: 'continue' | 'stop') => void;
}) {
  const items = useMemo(() => flattenItems(session), [session]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const item = items[currentIndex]!;
  const viewportLines = Math.max(8, (process.stdout.rows ?? 24) - 10);

  const nPrompt = session.stalePrompts.length;
  const nSkill = session.staleSkills.length;
  const nRubric = session.staleRubricWeights ? 1 : 0;

  const diffLines = useMemo(() => {
    const lines = buildUnifiedDiffLines(item.liveBody, item.winnerBody);
    return lines.length > 0 ? lines : null;
  }, [item.liveBody, item.winnerBody]);

  const visibleLines = useMemo(() => {
    if (!diffLines) return [];
    const maxStart = Math.max(0, diffLines.length - viewportLines);
    const start = Math.min(Math.max(0, scrollOffset), maxStart);
    return diffLines.slice(start, start + viewportLines);
  }, [diffLines, scrollOffset, viewportLines]);

  useInput((input, key) => {
    const ch = input.length === 1 ? input.toLowerCase() : '';

    if (ch === 'p' || key.return) {
      onDone('continue');
      return;
    }
    if (ch === 's') {
      onDone('stop');
      return;
    }
    if (ch === 'q' || key.escape) {
      onDone('stop');
      return;
    }

    if (input === ']') {
      setCurrentIndex((i) => {
        const n = (i + 1) % items.length;
        setScrollOffset(0);
        return n;
      });
      return;
    }
    if (input === '[') {
      setCurrentIndex((i) => {
        const n = (i - 1 + items.length) % items.length;
        setScrollOffset(0);
        return n;
      });
      return;
    }

    if (key.upArrow || ch === 'k') {
      setScrollOffset((s) => Math.max(0, s - 1));
      return;
    }
    if (key.downArrow || ch === 'j') {
      setScrollOffset((s) => s + 1);
    }
  });

  const totalItems = items.length;
  const meanStr = session.meanScore >= 0 ? session.meanScore.toFixed(2) : 'n/a';

  const curSection = sectionAtIndex(currentIndex, nPrompt, nSkill);

  const promoteLabel = promoteOnly
    ? 'apply winner (prompts, skills, rubric weights) + Langfuse sync if prompts changed, then exit'
    : 'apply winner (prompts, skills, rubric weights) + Langfuse sync if prompts changed, then run harness';
  const skipLabel = 'exit without changing files';

  const totalStale = nPrompt + nSkill + nRubric;
  const rubricSummary = nRubric ? `, ${nRubric} rubric weight change` : '';

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold>Preflight promotion review</Text>
        <Text>
          {session.sessionFolder} <Text color={dimText}>(candidate-{session.candidateId}, mean {meanStr})</Text>
        </Text>
        <Text color={dimText}>
          {totalStale} unpromoted item(s): {nPrompt} prompt(s), {nSkill} skill(s){rubricSummary}
        </Text>
      </Box>

      {session.allFetchesFailed ? (
        <Text color="yellow">Could not fetch live prompts from API — overrides may show as additions only.</Text>
      ) : null}

      <Box flexDirection="row" flexWrap="wrap" marginBottom={1}>
        <Text bold={curSection === 'prompt'} color={curSection === 'prompt' ? undefined : dimText}>
          Prompts ({nPrompt})
        </Text>
        <Text color={dimText}> · </Text>
        <Text bold={curSection === 'skill'} color={curSection === 'skill' ? undefined : dimText}>
          Skills ({nSkill})
        </Text>
        <Text color={dimText}> · </Text>
        <Text bold={curSection === 'rubric'} color={curSection === 'rubric' ? undefined : dimText}>
          Rubric weights ({nRubric})
        </Text>
      </Box>

      <Box marginBottom={0} width="100%">
        <Text bold>{itemLabel(item, currentIndex, totalItems)}</Text>
      </Box>

      {item.kind === 'prompt' && item.fetchError ? (
        <Text color="yellow">Live fetch: {item.fetchError}</Text>
      ) : null}

      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        {!diffLines ? (
          <Text color={dimText}>No differences (bodies match).</Text>
        ) : (
          visibleLines.map((line, i) => (
            <Text key={`${currentIndex}-${scrollOffset + i}`} color={diffLineColor(line.kind)}>
              {line.text}
            </Text>
          ))
        )}
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor={dimText} paddingX={1} marginTop={1}>
        <Text>
          <Text bold color="green">P</Text>
          <Text> Promote </Text>
          <Text color={dimText}>— {promoteLabel}</Text>
        </Text>
        <Text>
          <Text bold color="yellow">S</Text>
          <Text> Skip    </Text>
          <Text color={dimText}>— {skipLabel}</Text>
        </Text>
        <Text>
          <Text bold color="red">Q</Text>
          <Text> Quit    </Text>
          <Text color={dimText}>— exit immediately</Text>
        </Text>
        {totalItems > 1 ? (
          <Text color={dimText}>
            [ / ] prev/next item · j/k scroll
          </Text>
        ) : (
          <Text color={dimText}>j/k scroll</Text>
        )}
        {nRubric ? (
          <Text color={dimText}>
            After promoting rubric weights: restart the API server so GET /api/config picks up the new file.
          </Text>
        ) : null}
      </Box>

      <Text color={dimText}>Full report: {session.reportPath}</Text>
    </Box>
  );
}
