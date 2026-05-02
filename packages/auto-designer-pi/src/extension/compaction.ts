/**
 * `session_before_compact` handler that runs Pi's `compact()` with extra
 * "additional focus" instructions sourced from the package's compaction prompt.
 *
 * Without this hook, Pi's auto-compaction calls `compact(..., undefined)` and
 * ignores any host-supplied instructions. The factory closes over a loader so
 * the prompt body can be lazily loaded (or hot-reloaded between sessions).
 */
import type { ExtensionAPI, ExtensionFactory } from '../internal/pi-types.ts';
import { compact } from '../internal/pi-types.ts';

/** Resolves the supplementary compaction instructions (full prompt body). */
export type CompactionFocusLoader = () => Promise<string>;

export function createDesignerCompactionExtensionFactory(
  getCompactionFocus: CompactionFocusLoader,
): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.on('session_before_compact', async (event, ctx) => {
      const model = ctx.model;
      if (!model) return;

      let focus = '';
      try {
        focus = (await getCompactionFocus()).trim();
      } catch {
        // Skill body is optional; fall through with whatever Pi already supplied.
      }

      const pieces = [event.customInstructions?.trim(), focus].filter((s) => s && s.length > 0);
      const customInstructions = pieces.length > 0 ? pieces.join('\n\n') : undefined;
      if (!customInstructions) return;

      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok || !auth.apiKey) return;

      try {
        const result = await compact(
          event.preparation,
          model,
          auth.apiKey,
          auth.headers,
          customInstructions,
          event.signal,
        );
        return { compaction: result };
      } catch {
        // Fall back to Pi's default compaction path on any error.
        return;
      }
    });
  };
}
