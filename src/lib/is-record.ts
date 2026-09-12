/**
 * True for a plain-ish object: not null, not an array.
 *
 * This exact predicate was implemented independently in three modules
 * (`stores/canvas-migrations.ts`, `stores/workspace-domain-migrate.ts`,
 * `services/persistence.ts`) for twelve call sites. They were byte-identical,
 * so the cost was not divergence risk so much as three places to look.
 *
 * Note it deliberately still accepts class instances and `Date`; every existing
 * call site only ever needed "is this safe to read arbitrary keys off", and
 * tightening it to a plain-object check would change behaviour at the
 * persistence boundary where a `Date` round-trips as an object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
