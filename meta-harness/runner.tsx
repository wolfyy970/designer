/**
 * Meta-Harness CLI entry: Ink TUI when TTY, plain console otherwise.
 *
 * Flow boundaries (same preflight implementation for all cases that run it):
 *
 * 1. **Default (`pnpm meta-harness`)** — Load benchmarks → require OPENROUTER (per mode) →
 *    `/api/health` → **full** unpromoted-winner preflight (`scanUnpromotedSessions` + Ink `PreflightReview`
 *    or `printPlainPreflightSummary`) → then harness (`App` or `runMetaHarnessEngine`). Proceeding after
 *    preflight still means you chose to run tests knowing prompts/skills may be stale until you promote.
 *
 * 2. **`--improve` / `--skip-promotion-check`** — Same harness entry as (1) but **skips** preflight entirely
 *    (go straight to dashboard / plain engine after health). No shortcut scan: the gate is not run.
 *
 * 3. **`--promote`** — **Only** `/api/health` → the **same** preflight as (1). After you press **P** in the
 *    TTY review, the CLI **applies** winner prompts into `shared-defaults.ts`, copies skill drift into
 *    `skills/`, runs `pnpm langfuse:sync-prompts` when Langfuse is configured, then exits. **S** / **Q**
 *    exits without file changes.
 *
 * **`--dry-run`** is separate: hydration preview only, no API health/preflight/harness in the normal sense.
 */
import { config as loadEnv } from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { render } from 'ink';
import type { MetaHarnessCliArgs, MetaHarnessConfig } from './config.ts';
import { normalizeError } from '../src/lib/error-utils.ts';
import { repoRoot } from './paths.ts';
import {
  DEFAULT_COMPILE_MODEL,
  DEFAULT_HYPOTHESIS_COUNT,
  INK_TTY_PREP_SEQUENCE,
  META_HARNESS_HEALTH_TIMEOUT_MS,
} from './constants.ts';
import { filterTestFilesBySubstrings, loadConfig, parseMetaHarnessArgv } from './config.ts';
import { runMetaHarnessEngine } from './runner-core.ts';
import { listTestCaseFiles } from './session.ts';
import {
  hydrateCompileRequest,
  hydrateMetaHarnessTestCase,
} from './test-case-hydrator.ts';
import { printPlainPreflightSummary } from './preflight-promotion-plain.ts';
import { scanUnpromotedSessions } from './preflight-promotion-check.ts';
import {
  applyPromotion,
  promotionSucceeded,
} from './apply-promotion.ts';
import { App } from './ui/App.tsx';
import { PreflightReview } from './ui/PreflightReview.tsx';
import { PromotionResultScreen } from './ui/PromotionResult.tsx';
import { createPlainCallbacks } from './ui/plain.ts';

loadEnv({ path: path.join(repoRoot(), '.env.local') });
loadEnv({ path: path.join(repoRoot(), '.env') });

async function assertMetaHarnessApiHealth(apiBaseUrl: string): Promise<void> {
  try {
    const healthRes = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(META_HARNESS_HEALTH_TIMEOUT_MS),
    });
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
  } catch (e) {
    console.error(
      `[meta-harness] API not reachable at ${apiBaseUrl}/health — is pnpm dev:server running?`,
    );
    console.error(`  ${normalizeError(e)}`);
    process.exit(1);
  }
}

/**
 * Single implementation of the unpromoted-winner preflight (used for default runs and `--promote`).
 * `promoteOnly` only changes post-review behavior (exit vs continue to harness), not scan depth or UI.
 */
async function runPreflightPromotionGate(p: {
  args: MetaHarnessCliArgs;
  cfg: MetaHarnessConfig;
  root: string;
  useInk: boolean;
  promoteOnly: boolean;
}): Promise<void> {
  const { args, cfg, root, useInk, promoteOnly } = p;
  const shouldRun = !args.dryRun && (promoteOnly || !args.skipPromotionCheck);
  if (!shouldRun) return;

  try {
    const historyRoot = path.join(root, 'meta-harness', 'history');
    const skillsDir = path.join(root, 'skills');
    const stale = await scanUnpromotedSessions({
      historyRoot,
      repoRoot: root,
      apiBaseUrl: cfg.apiBaseUrl,
      skillsDir,
    });

    if (!stale) {
      console.log('[meta-harness] Preflight: all recent winners already promoted.');
      if (promoteOnly) process.exit(0);
      return;
    }

    if (useInk) {
      process.stdout.write(INK_TTY_PREP_SEQUENCE);
      let settled = false;
      const decision = await new Promise<'continue' | 'stop'>((resolve) => {
        const { waitUntilExit, unmount } = render(
          <PreflightReview
            session={stale}
            promoteOnly={promoteOnly}
            onDone={(action) => {
              if (settled) return;
              settled = true;
              unmount();
              resolve(action);
            }}
          />,
          { exitOnCtrlC: true },
        );
        void waitUntilExit().then(() => {
          if (!settled) {
            settled = true;
            resolve('stop');
          }
        });
      });

      if (decision === 'stop') {
        console.log('\n[meta-harness] Skipped — no files changed.');
        process.exit(0);
      }

      const promotion = await applyPromotion(stale, root);

      const resultDecision = await new Promise<'proceed' | 'quit'>((resolve) => {
        let resultSettled = false;
        const { waitUntilExit: waitResult, unmount: unmountResult } = render(
          <PromotionResultScreen
            result={promotion}
            canProceed={!promoteOnly && promotionSucceeded(promotion)}
            onDone={(act) => {
              if (resultSettled) return;
              resultSettled = true;
              unmountResult();
              resolve(act);
            }}
          />,
          { exitOnCtrlC: true },
        );
        void waitResult().then(() => {
          if (!resultSettled) {
            resultSettled = true;
            resolve('quit');
          }
        });
      });

      if (resultDecision === 'quit' || !promotionSucceeded(promotion)) {
        process.exit(promotionSucceeded(promotion) ? 0 : 1);
      }
    } else {
      printPlainPreflightSummary(stale);
      if (promoteOnly) {
        console.log(
          '\n[meta-harness] Plain mode: automatic apply runs only in a TTY (press P in the Ink review). Re-run without --plain or apply manually from:',
        );
        console.log(`  ${stale.reportPath}`);
        process.exit(0);
      }
    }
  } catch (err) {
    console.warn(
      `[meta-harness] Preflight check failed: ${normalizeError(err)}. Continuing.`,
    );
    if (promoteOnly) process.exit(0);
  }
}

export async function main(): Promise<void> {
  const cfg = await loadConfig();
  const args = parseMetaHarnessArgv(process.argv.slice(2), cfg);
  const root = repoRoot();
  const testCasesDir = path.join(root, 'meta-harness', 'test-cases');

  if (args.promoteOnly) {
    if (args.dryRun) {
      console.error('[meta-harness] Do not combine --promote with --dry-run.');
      process.exit(1);
    }
    await assertMetaHarnessApiHealth(cfg.apiBaseUrl);
    const useInk = process.stdout.isTTY && !args.plain;
    await runPreflightPromotionGate({ args, cfg, root, useInk, promoteOnly: true });
    process.exit(0);
  }

  const allTestFiles = (await listTestCaseFiles(testCasesDir)).sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b)),
  );
  if (allTestFiles.length === 0) {
    console.error('[meta-harness] No test cases in', testCasesDir);
    process.exit(1);
  }

  const filteredTests = filterTestFilesBySubstrings(allTestFiles, args.testFilters);
  if (filteredTests.length === 0) {
    console.error(
      '[meta-harness] No test cases matched filters:',
      args.testFilters.join(', ') || '(empty)',
    );
    process.exit(1);
  }

  if (args.dryRun) {
    const raw = JSON.parse(await readFile(filteredTests[0]!, 'utf8')) as unknown;
    const compileProvider = cfg.compileProvider ?? cfg.defaultCompilerProvider;
    const compileModel = cfg.compileModel ?? DEFAULT_COMPILE_MODEL;
    if (args.mode === 'compile' || args.mode === 'e2e') {
      const compileBody = hydrateCompileRequest(raw, {
        compileProvider,
        compileModel,
        supportsVision: cfg.supportsVision,
        defaultHypothesisCount: cfg.compileHypothesisCount ?? DEFAULT_HYPOTHESIS_COUNT,
      });
      console.log(JSON.stringify(compileBody, null, 2));
    } else {
      const body = hydrateMetaHarnessTestCase(raw, {
        defaultCompilerProvider: cfg.defaultCompilerProvider,
        correlationId: `mh-dry-run`,
      });
      console.log(JSON.stringify(body, null, 2));
    }
    console.error(`[meta-harness] dry-run OK (${args.mode}) — no API calls`);
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY ?? '';
  if (!args.evalOnly && !apiKey) {
    console.error('[meta-harness] Set OPENROUTER_API_KEY for the proposer (or use --eval-only)');
    process.exit(1);
  }
  if (args.evalOnly && args.mode === 'compile' && !apiKey) {
    console.error(
      '[meta-harness] compile mode needs OPENROUTER_API_KEY for the hypothesis rubric (even with --eval-only)',
    );
    process.exit(1);
  }

  await assertMetaHarnessApiHealth(cfg.apiBaseUrl);

  const useInk = process.stdout.isTTY && !args.plain;
  await runPreflightPromotionGate({ args, cfg, root, useInk, promoteOnly: false });

  if (useInk) {
    process.stdout.write(INK_TTY_PREP_SEQUENCE);
    const { waitUntilExit } = render(<App args={args} config={cfg} />, { exitOnCtrlC: true });
    await waitUntilExit();
    return;
  }

  await runMetaHarnessEngine(args, createPlainCallbacks(args), { config: cfg });
}

main().catch((err) => {
  console.error('[meta-harness]', err);
  process.exit(1);
});
