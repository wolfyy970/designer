/**
 * Fixed model when server LOCKDOWN is enabled (OpenRouter + MiniMax M2.5).
 * Shared by client UI and server enforcement — no env reads here.
 */
export const LOCKDOWN_PROVIDER_ID = 'openrouter' as const;
export const LOCKDOWN_MODEL_ID = 'minimax/minimax-m2.5' as const;
export const LOCKDOWN_MODEL_LABEL = 'MiniMax M2.5';

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
