import { Badge, Spinner } from '@inkjs/ui';
import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import { dimText } from './theme.ts';
import type { RunnerState } from './state.ts';

/** How many recent proposer tool rows the TUI shows (full history remains in state). */
const RECENT_TOOL_ROWS = 5;

function Section({ children }: { children: ReactNode }) {
  return (
    <Box flexDirection="column" gap={0}>
      <Text bold>Proposer</Text>
      {children}
    </Box>
  );
}

export function ProposerPanel({ state }: { state: RunnerState }) {
  if (state.evalOnly) {
    return (
      <Section>
        <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
          <Text color={dimText}>eval-only (no proposer)</Text>
        </Box>
      </Section>
    );
  }

  const p = state.proposer;
  if (p.phase === 'idle') {
    return (
      <Section>
        <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="column">
          <Text color={dimText}>waiting…</Text>
        </Box>
      </Section>
    );
  }

  if (p.phase === 'running') {
    return (
      <Section>
        <Box borderStyle="single" borderColor="cyan" paddingX={1} flexDirection="column" gap={0}>
          <Box flexDirection="row" gap={1}>
            <Spinner />
            <Text>
              <Text bold>{p.currentTool || '…'}</Text>
              {p.currentTool && p.toolLog.length ? ` ${p.toolLog[p.toolLog.length - 1]?.summary ?? ''}` : ''}
            </Text>
          </Box>
          <Text color={dimText}>
            round {p.currentRound}/{p.maxRounds} · {p.model}
          </Text>
          {p.toolLog.length > 0 ? (
            <Box flexDirection="column" marginTop={0}>
              <Text color={dimText} bold>
                recent tools (last {RECENT_TOOL_ROWS})
              </Text>
              {p.toolLog.slice(-RECENT_TOOL_ROWS).map((e) => (
                <Text key={`${e.round}-${e.tool}-${e.summary}`} color={dimText}>
                  {'  '}· {e.tool}
                  {e.summary ? ` ${e.summary}` : ''}
                </Text>
              ))}
            </Box>
          ) : null}
        </Box>
      </Section>
    );
  }

  const sec = p.doneElapsedMs != null ? (p.doneElapsedMs / 1000).toFixed(1) : '?';

  return (
    <Section>
      <Box borderStyle="single" borderColor="green" paddingX={1} flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Badge color="green">proposer done</Badge>
          <Text>
            {sec}s · {p.toolLog.length} tool calls
          </Text>
        </Box>
        {p.overrides.length ? (
          <Text color={dimText}>overrides: {p.overrides.join(', ')}</Text>
        ) : null}
        {p.reasoningPreview ? <Text color={dimText}>{p.reasoningPreview}</Text> : null}
      </Box>
    </Section>
  );
}
