/**
 * Structural HTML validation for the `validate_html` tool.
 * Workspace-relative assets are checked against `hasProjectFile`; external
 * references are blocked except for the Google Fonts allowlist.
 */
import {
  isAllowedGoogleFontStylesheetUrl,
  isAllowedGoogleFontsExternalRef,
} from './google-fonts-allowlist.ts';
import { classifyAssetRef, resolveVirtualAssetPath } from './resolve-virtual-asset-path.ts';

function extractCssImportUrls(css: string): string[] {
  const urls: string[] = [];
  const urlParen = /@import\s+url\s*\(\s*["']?([^"')]+)["']?\s*\)\s*;?/gi;
  const quoted = /@import\s+["']([^"']+)["']\s*;?/gi;
  let m: RegExpExecArray | null;
  while ((m = urlParen.exec(css)) !== null) {
    const u = m[1]?.trim();
    if (u) urls.push(u);
  }
  while ((m = quoted.exec(css)) !== null) {
    const u = m[1]?.trim();
    if (u) urls.push(u);
  }
  return urls;
}

export async function validateHtmlWorkspaceContent(
  content: string,
  htmlPath: string,
  hasProjectFile: (rel: string) => Promise<boolean>,
): Promise<string[]> {
  const issues: string[] = [];

  if (!/<!DOCTYPE\s+html/i.test(content)) {
    issues.push('Missing DOCTYPE declaration');
  }

  for (const tag of ['html', 'head', 'body']) {
    if (!new RegExp(`<${tag}[\\s>]`, 'i').test(content)) {
      issues.push(`Missing <${tag}> tag`);
    }
  }

  const scriptOpen = (content.match(/<script/gi) ?? []).length;
  const scriptClose = (content.match(/<\/script>/gi) ?? []).length;
  if (scriptOpen !== scriptClose) {
    issues.push(`Unbalanced <script> tags: ${scriptOpen} opening, ${scriptClose} closing`);
  }

  const styleOpen = (content.match(/<style/gi) ?? []).length;
  const styleClose = (content.match(/<\/style>/gi) ?? []).length;
  if (styleOpen !== styleClose) {
    issues.push(`Unbalanced <style> tags: ${styleOpen} opening, ${styleClose} closing`);
  }

  const stylesheetRefs = [
    ...content.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi),
  ].map((match) => match[1] ?? '');
  const scriptRefs = [
    ...content.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi),
  ].map((match) => match[1] ?? '');

  for (const ref of stylesheetRefs) {
    const kind = classifyAssetRef(ref);
    if (kind === 'external') {
      if (isAllowedGoogleFontStylesheetUrl(ref)) continue;
      issues.push(`External asset reference found: ${ref}`);
      continue;
    }
    if (kind === 'absolute') {
      issues.push(`Use relative asset paths instead of root-absolute paths: ${ref}`);
    }
    const resolved = resolveVirtualAssetPath(ref, htmlPath);
    if (!resolved) continue;
    if (!(await hasProjectFile(resolved))) {
      issues.push(`Referenced asset not found in workspace: ${ref}`);
    }
  }

  for (const ref of scriptRefs) {
    const kind = classifyAssetRef(ref);
    if (kind === 'external') {
      issues.push(`External asset reference found: ${ref}`);
      continue;
    }
    if (kind === 'absolute') {
      issues.push(`Use relative asset paths instead of root-absolute paths: ${ref}`);
    }
    const resolved = resolveVirtualAssetPath(ref, htmlPath);
    if (!resolved) continue;
    if (!(await hasProjectFile(resolved))) {
      issues.push(`Referenced asset not found in workspace: ${ref}`);
    }
  }

  for (const styleMatch of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = styleMatch[1] ?? '';
    for (const importUrl of extractCssImportUrls(css)) {
      if (classifyAssetRef(importUrl) !== 'external') continue;
      if (isAllowedGoogleFontsExternalRef(importUrl)) continue;
      issues.push(`External @import in <style> not allowed: ${importUrl}`);
    }
  }

  return issues;
}
