/**
 * Host-side frontmatter splitting, delegated to the Pi package.
 *
 * This used to be a second implementation. The two had already diverged on real
 * input shapes — CRLF, UTF-8 BOM, a `----` line, and a leading blank line — and
 * the package's copy was the one feeding Pi's `customPrompt`, so the safer
 * implementation was *not* the one building the system prompt. A BOM made the
 * package version return the raw YAML header as the prompt body, leaking
 * metadata into every session.
 *
 * One implementation now lives in `@auto-designer/pi` (`parseFrontmatter`, with
 * `stripFrontmatter` as the body-only convenience). This wrapper preserves the
 * host's calling convention — `null` when there is no frontmatter — so existing
 * callers (`server/lib/frontmatter.ts` → `skill-discovery.ts`) are unchanged.
 *
 * The package is already a host dependency (`server/lib/prompt-resolution.ts`
 * imports it), so this adds no new coupling.
 */
import { parseFrontmatter } from '@auto-designer/pi';

export function splitFrontmatterMarkdown(
  raw: string,
): { frontmatterYaml: string; body: string } | null {
  const { yaml, body } = parseFrontmatter(raw);
  if (yaml === undefined) return null;
  return { frontmatterYaml: yaml, body };
}
