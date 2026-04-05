import { useInput } from 'ink';
import { Box, Text } from 'ink';
import type { PromotionResult } from '../apply-promotion.ts';
import { langfuseStatusLine, promotionSucceeded } from '../apply-promotion.ts';
import { dimText } from './theme.ts';

export function PromotionResultScreen({
  result,
  canProceed,
  onDone,
}: {
  result: PromotionResult;
  /** When false (`--promote`), there is no harness to proceed to — only Q. */
  canProceed: boolean;
  onDone: (action: 'proceed' | 'quit') => void;
}) {
  const ok = promotionSucceeded(result);
  const borderColor = ok ? 'green' : 'red';
  const headline = ok ? 'Promotion succeeded' : 'Promotion failed';

  useInput((input, key) => {
    const ch = input.length === 1 ? input.toLowerCase() : '';
    if (ch === 'q' || key.escape) {
      onDone('quit');
      return;
    }
    if (canProceed && (ch === 'p' || key.return)) {
      onDone('proceed');
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="column" borderStyle="single" borderColor={borderColor} paddingX={1} marginBottom={1}>
        <Text bold color={ok ? 'green' : 'red'}>{headline}</Text>

        {result.promptsPatched.length > 0 ? (
          <Box flexDirection="column">
            <Text bold>Prompts</Text>
            {result.promptsPatched.map((p) => (
              <Text key={p.key}>
                {'  '}
                <Text color={p.ok ? 'green' : 'red'}>{p.ok ? 'OK' : 'FAIL'}</Text>
                {'  '}
                {p.key}
                {p.error ? <Text color="red"> — {p.error}</Text> : null}
              </Text>
            ))}
          </Box>
        ) : null}

        {result.skillsCopied.length > 0 ? (
          <Box flexDirection="column">
            <Text bold>Skills</Text>
            {result.skillsCopied.map((s) => (
              <Text key={s.relPath}>
                {'  '}
                <Text color={s.ok ? 'green' : 'red'}>{s.ok ? 'OK' : 'FAIL'}</Text>
                {'  '}
                {s.relPath}
                {s.error ? <Text color="red"> — {s.error}</Text> : null}
              </Text>
            ))}
          </Box>
        ) : null}

        <Text>
          <Text bold>Langfuse</Text>
          {'  '}
          <Text color={dimText}>{langfuseStatusLine(result)}</Text>
        </Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor={dimText} paddingX={1}>
        {canProceed && ok ? (
          <Text>
            <Text bold color="green">P</Text>
            <Text> Proceed </Text>
            <Text color={dimText}>— run the harness</Text>
          </Text>
        ) : null}
        <Text>
          <Text bold color={ok ? 'yellow' : 'red'}>Q</Text>
          <Text> Quit    </Text>
          <Text color={dimText}>— exit</Text>
        </Text>
      </Box>
    </Box>
  );
}
