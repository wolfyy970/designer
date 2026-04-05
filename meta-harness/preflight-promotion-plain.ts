/**
 * Non-TTY / --plain preflight: print unified diffs then auto-proceed.
 */
import { buildUnifiedDiffLines } from './preflight-diff-lines.ts';
import type { UnpromotedSession } from './preflight-promotion-check.ts';
import { bannerLine } from './ui/format-helpers.ts';

const ANSI_RED = '\x1b[31m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_DIM = '\x1b[90m';
const ANSI_RESET = '\x1b[0m';

function colorizeLine(text: string): string {
  if (text.startsWith('+') && !text.startsWith('+++')) return `${ANSI_GREEN}${text}${ANSI_RESET}`;
  if (text.startsWith('-') && !text.startsWith('---')) return `${ANSI_RED}${text}${ANSI_RESET}`;
  if (text.startsWith('@@')) return `${ANSI_CYAN}${text}${ANSI_RESET}`;
  return `${ANSI_DIM}${text}${ANSI_RESET}`;
}

export function printPlainPreflightSummary(session: UnpromotedSession): void {
  const meanStr = session.meanScore >= 0 ? session.meanScore.toFixed(2) : 'n/a';
  bannerLine(
    `Preflight: unpromoted winner · ${session.sessionFolder} (candidate-${session.candidateId}, mean ${meanStr})`,
  );

  if (session.allFetchesFailed) {
    console.warn('  Could not fetch live prompts from API — diffs may show winner vs empty live.');
  }

  const prompts = [...session.stalePrompts].sort((a, b) => a.key.localeCompare(b.key));
  for (const p of prompts) {
    bannerLine(`Prompt: ${p.key}`);
    if (p.fetchError) {
      console.warn(`  (live fetch: ${p.fetchError})`);
    }
    const lines = buildUnifiedDiffLines(p.liveBody, p.winnerBody);
    if (lines.length === 0) {
      console.log('  (no line differences)');
    } else {
      for (const line of lines) {
        console.log(`  ${colorizeLine(line.text)}`);
      }
    }
    console.log();
  }

  const skills = [...session.staleSkills].sort((a, b) => a.relPath.localeCompare(b.relPath));
  for (const s of skills) {
    bannerLine(`Skill [${s.kind}]: ${s.relPath}`);
    const lines = buildUnifiedDiffLines(s.liveBody, s.winnerBody);
    if (lines.length === 0) {
      console.log('  (no line differences)');
    } else {
      for (const line of lines) {
        console.log(`  ${colorizeLine(line.text)}`);
      }
    }
    console.log();
  }

  console.warn(`  Unpromoted changes detected. Review: ${session.reportPath}`);
  console.warn('  Proceeding automatically (--plain / non-interactive).');
}
