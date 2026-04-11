/**
 * Pi extension: run SDK `compact()` with "additional focus" text on auto/manual compaction.
 * Without this, Pi's auto-compaction calls `compact(..., undefined)` and ignores `agent-context-compaction`.
 */
import type { ExtensionAPI, ExtensionFactory } from './pi-sdk/types.ts';
import { compact } from './pi-sdk/types.ts';

/** Resolves the supplementary compaction instructions from the `agent-context-compaction` skill. */
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
        // Skill read optional — fall through with event-only instructions
      }

      const pieces = [event.customInstructions?.trim(), focus].filter((s) => s && s.length > 0);
      const customInstructions = pieces.length > 0 ? pieces.join('\n\n') : undefined;
      if (!customInstructions) {
        return;
      }

      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok || !auth.apiKey) {
        return;
      }

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
        // Fall back to Pi default compaction path
        return;
      }
    });
  };
}
