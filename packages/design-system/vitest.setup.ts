/**
 * Vitest-compatible jest-dom entry point. The bare `@testing-library/jest-dom`
 * import resolves to a build that expects `expect` to already be a global, which
 * is not the case in Vitest's `setupFiles` phase — it throws
 * `ReferenceError: expect is not defined`. The `/vitest` subpath registers the
 * matchers against Vitest's own `expect` instead.
 */
import '@testing-library/jest-dom/vitest';
