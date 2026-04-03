/** Decorative version-badge rotation only — not eval severity. Cycles v1, v2, v3, … */
const BADGE_COLORS = [
  { bg: 'bg-info-subtle', text: 'text-info' },
  { bg: 'bg-accent-subtle', text: 'text-accent' },
  { bg: 'bg-warning-subtle', text: 'text-warning' },
  { bg: 'bg-error-subtle', text: 'text-error' },
  { bg: 'bg-success-subtle', text: 'text-success' },
  { bg: 'bg-fg/5', text: 'text-fg-secondary' },
] as const;

export function badgeColor(version: number) {
  return BADGE_COLORS[(version - 1) % BADGE_COLORS.length];
}
