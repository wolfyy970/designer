/**
 * Fixed model when server LOCKDOWN is enabled (OpenRouter + MiniMax M2.5).
 * Shared by client UI and server enforcement — no env reads here.
 */
export const LOCKDOWN_PROVIDER_ID = 'openrouter' as const;
export const LOCKDOWN_MODEL_ID = 'minimax/minimax-m2.5' as const;
export const LOCKDOWN_MODEL_LABEL = 'MiniMax M2.5';

/**
 * LOCKDOWN env semantics: missing/empty → locked (true).
 * Unlock only with explicit false, 0, no, off (case-insensitive).
 */
export function parseLockdownEnvValue(raw: string | undefined): boolean {
  if (raw === undefined || String(raw).trim() === '') return true;
  const s = String(raw).toLowerCase().trim();
  if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  return true;
}

/** Force OpenRouter + MiniMax M2.5 on every credential lane when server lockdown is active. */
export function pinModelCredentialsIfLockdown<T extends { providerId: string; modelId: string }>(
  creds: readonly T[],
  lockdown: boolean,
): T[] {
  if (!lockdown) return creds.map((c) => ({ ...c }));
  return creds.map((c) => ({
    ...c,
    providerId: LOCKDOWN_PROVIDER_ID,
    modelId: LOCKDOWN_MODEL_ID,
  }));
}
