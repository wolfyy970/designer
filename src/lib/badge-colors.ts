/**
 * Run/version pill (v1, v2, …) on variant footers and overlay — always brand accent.
 * Not eval severity; do not rotate hues by run number.
 */
const VERSION_BADGE = {
  bg: 'bg-accent-subtle',
  text: 'text-accent',
} as const;

export function badgeColor(_runNumber: number) {
  return VERSION_BADGE;
}
