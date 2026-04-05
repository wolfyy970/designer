/**
 * Scan recent meta-harness history for a winning session whose prompts/skills
 * differ from live API + repo (unpromoted).
 */
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { normalizeError } from '../src/lib/error-utils.ts';
import { ARTIFACT } from './constants.ts';
import { fetchPromptBody } from './prompt-fetch.ts';
import { diffSkillTrees } from './skill-diff.ts';
import { BestCandidateJsonSchema, parsePromptOverridesJsonString } from './schemas.ts';

const PREFLIGHT_PROMPT_FETCH_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_SESSIONS_TO_SCAN = 5;

export type StalePrompt = {
  key: string;
  liveBody: string;
  winnerBody: string;
  fetchError?: string;
};

export type StaleSkill = {
  relPath: string;
  liveBody: string;
  winnerBody: string;
  kind: 'modified' | 'added' | 'deleted';
};

export type UnpromotedSession = {
  sessionFolder: string;
  candidateId: number;
  meanScore: number;
  stalePrompts: StalePrompt[];
  staleSkills: StaleSkill[];
  /** Repo-relative path for operator copy/paste */
  reportPath: string;
  allFetchesFailed: boolean;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readText(p: string): Promise<string | null> {
  try {
    return await readFile(p, 'utf8');
  } catch {
    return null;
  }
}

/** GET /api/prompts/:key with timeout; returns body or error detail. */
async function fetchLivePromptBody(
  apiBaseUrl: string,
  key: string,
): Promise<{ body: string | null; fetchError?: string }> {
  const r = await fetchPromptBody(apiBaseUrl, key, PREFLIGHT_PROMPT_FETCH_TIMEOUT_MS);
  return { body: r.body, fetchError: r.error };
}

function loadWinnerOverrides(raw: string | null): Record<string, string> {
  if (!raw) return {};
  return parsePromptOverridesJsonString(raw);
}

type ScanUnpromotedSessionsOptions = {
  historyRoot: string;
  repoRoot: string;
  apiBaseUrl: string;
  skillsDir: string;
  maxSessionsToScan?: number;
};

/**
 * Returns the most recent completed session (has report + best-candidate) whose
 * winner still differs from live prompts and/or skills/, or null if none.
 */
export async function scanUnpromotedSessions(
  options: ScanUnpromotedSessionsOptions,
): Promise<UnpromotedSession | null> {
  const { historyRoot, repoRoot, apiBaseUrl, skillsDir } = options;
  const maxSessions = options.maxSessionsToScan ?? DEFAULT_MAX_SESSIONS_TO_SCAN;

  let sessionNames: string[];
  try {
    sessionNames = (await readdir(historyRoot, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name.startsWith('session-'))
      .map((e) => e.name)
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return null;
  }

  for (const sessionFolder of sessionNames.slice(0, maxSessions)) {
    const sessionDir = path.join(historyRoot, sessionFolder);
    const reportAbs = path.join(sessionDir, ARTIFACT.promotionReportMd);
    const bestAbs = path.join(sessionDir, ARTIFACT.bestCandidateJson);
    if (!(await fileExists(reportAbs)) || !(await fileExists(bestAbs))) continue;

    let bestRaw: string;
    try {
      bestRaw = await readFile(bestAbs, 'utf8');
    } catch {
      console.warn(`[meta-harness] Preflight: skip ${sessionFolder}: could not read best-candidate.json`);
      continue;
    }
    let bestUnknown: unknown;
    try {
      bestUnknown = JSON.parse(bestRaw) as unknown;
    } catch {
      console.warn(`[meta-harness] Preflight: skip ${sessionFolder}: invalid JSON in best-candidate.json`);
      continue;
    }
    const parsed = BestCandidateJsonSchema.safeParse(bestUnknown);
    if (!parsed.success) {
      console.warn(`[meta-harness] Preflight: skip ${sessionFolder}: invalid best-candidate.json`);
      continue;
    }
    const candidateId = parsed.data.candidateId ?? -1;
    if (candidateId < 0) continue;
    const meanScore =
      parsed.data.meanScore != null && Number.isFinite(parsed.data.meanScore) ? parsed.data.meanScore : -1;

    const candidateDir = path.join(sessionDir, `candidate-${candidateId}`);
    if (!(await fileExists(candidateDir))) continue;

    const overridesRaw = await readText(path.join(candidateDir, ARTIFACT.promptOverridesJson));
    const overrides = loadWinnerOverrides(overridesRaw);
    const sortedKeys = Object.keys(overrides).sort();

    const stalePrompts: StalePrompt[] = [];
    let fetchSuccesses = 0;
    for (const key of sortedKeys) {
      const winnerBody = overrides[key]!;
      const { body: liveBody, fetchError } = await fetchLivePromptBody(apiBaseUrl, key);
      if (liveBody != null) fetchSuccesses += 1;
      if (liveBody === winnerBody) continue;
      stalePrompts.push({
        key,
        liveBody: liveBody ?? '',
        winnerBody,
        fetchError: liveBody == null ? fetchError : undefined,
      });
    }
    const allFetchesFailed =
      sortedKeys.length > 0 && fetchSuccesses === 0 && stalePrompts.length > 0;

    const staleSkills: StaleSkill[] = [];
    const snapshotRoot = path.join(candidateDir, ARTIFACT.skillsSnapshot);
    try {
      const tree = await diffSkillTrees(snapshotRoot, skillsDir);
      for (const m of tree.modified) {
        const snapPath = path.join(snapshotRoot, m.relPath);
        const livePath = path.join(skillsDir, m.relPath);
        const winnerBody = (await readText(snapPath)) ?? '';
        const liveSk = (await readText(livePath)) ?? '';
        staleSkills.push({ relPath: m.relPath, liveBody: liveSk, winnerBody, kind: 'modified' });
      }
      for (const rel of tree.deleted) {
        const snapPath = path.join(snapshotRoot, rel);
        const winnerBody = (await readText(snapPath)) ?? '';
        staleSkills.push({ relPath: rel, liveBody: '', winnerBody, kind: 'deleted' });
      }
      for (const rel of tree.added) {
        const livePath = path.join(skillsDir, rel);
        const liveSk = (await readText(livePath)) ?? '';
        staleSkills.push({ relPath: rel, liveBody: liveSk, winnerBody: '', kind: 'added' });
      }
    } catch (e) {
      console.warn(
        `[meta-harness] Preflight: skill tree diff failed for ${sessionFolder}:`,
        normalizeError(e),
      );
    }

    staleSkills.sort((a, b) => a.relPath.localeCompare(b.relPath));

    if (stalePrompts.length === 0 && staleSkills.length === 0) continue;

    const reportRel = path.relative(repoRoot, reportAbs).split(path.sep).join('/');
    return {
      sessionFolder,
      candidateId,
      meanScore,
      stalePrompts,
      staleSkills,
      reportPath: reportRel,
      allFetchesFailed,
    };
  }

  return null;
}
