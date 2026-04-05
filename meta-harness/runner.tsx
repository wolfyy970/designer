/**
 * Meta-Harness CLI entry: Ink TUI when TTY, plain console otherwise.
 */
import { config as loadEnv } from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { render } from 'ink';
import { repoRoot } from './paths.ts';
import { DEFAULT_COMPILE_MODEL, META_HARNESS_HEALTH_TIMEOUT_MS } from './constants.ts';
import {
  filterTestFilesBySubstrings,
  loadConfig,
  listTestCaseFiles,
  parseMetaHarnessArgv,
  runMetaHarnessEngine,
} from './runner-core.ts';
import {
  hydrateCompileRequest,
  hydrateMetaHarnessTestCase,
} from './test-case-hydrator.ts';
import { App } from './ui/App.tsx';
import { createPlainCallbacks } from './ui/plain.ts';

loadEnv({ path: path.join(repoRoot(), '.env.local') });
loadEnv({ path: path.join(repoRoot(), '.env') });

export async function main(): Promise<void> {
  const cfg = await loadConfig();
  const args = parseMetaHarnessArgv(process.argv.slice(2), cfg);
  const root = repoRoot();
  const testCasesDir = path.join(root, 'meta-harness', 'test-cases');

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
        defaultHypothesisCount: cfg.compileHypothesisCount ?? 5,
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

  try {
    const healthRes = await fetch(`${cfg.apiBaseUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(META_HARNESS_HEALTH_TIMEOUT_MS),
    });
    if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
  } catch (e) {
    console.error(
      `[meta-harness] API not reachable at ${cfg.apiBaseUrl}/health — is pnpm dev:server running?`,
    );
    console.error(`  ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  const useInk = process.stdout.isTTY && !args.plain;
  if (useInk) {
    const { waitUntilExit } = render(<App args={args} />, { exitOnCtrlC: true });
    await waitUntilExit();
    return;
  }

  await runMetaHarnessEngine(args, createPlainCallbacks(args));
}

main().catch((err) => {
  console.error('[meta-harness]', err);
  process.exit(1);
});
