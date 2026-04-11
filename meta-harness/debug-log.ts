/**
 * Optional diagnostics for best-effort paths (missing files, parse noise).
 * Suppressed under Vitest so test output stays readable.
 */
export function debugMetaHarness(label: string, detail: string): void {
  if (process.env.VITEST === 'true') return;
  console.debug(`[meta-harness] ${label}`, detail);
}
