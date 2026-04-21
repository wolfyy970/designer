/**
 * Maps the optional `leftRail` prop on NodeShell to a Tailwind class pair.
 * Lives in its own file so it can be unit-tested without mounting the React
 * Flow canvas context, and so the component file stays export-only for the
 * React Refresh rule.
 */
export function railClassFor(leftRail: 'success' | 'warning' | null | undefined): string {
  if (leftRail === 'success') return 'border-l-2 border-l-success';
  if (leftRail === 'warning') return 'border-l-2 border-l-warning';
  return '';
}
