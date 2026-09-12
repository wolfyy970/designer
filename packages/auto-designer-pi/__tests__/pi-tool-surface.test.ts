import { afterEach, describe, expect, it } from 'vitest';

import {
  ToolSurface,
  ToolSurfaceError,
  _resetUpstreamPiBuiltinNamesCacheForTesting,
  buildDesignToolSurface,
  buildSandboxedBashTool,
  buildSandboxedEditTool,
  buildSandboxedFindTool,
  buildSandboxedGrepTool,
  buildSandboxedLsTool,
  buildSandboxedReadTool,
  buildSandboxedWriteTool,
  createAgentBashSandbox,
  createDesignerExtensionFactory,
  createSandboxToolContext,
  type PiBuiltinToolName,
} from '../src/index.ts';

afterEach(() => {
  _resetUpstreamPiBuiltinNamesCacheForTesting();
});

/**
 * The Pi tool surface is the security boundary between the model and the host
 * filesystem. These tests pin the architectural contract enforced by
 * `ToolSurface.build()`:
 *
 *   1. The **exact surface `host.ts` creates** (via `buildDesignToolSurface`,
 *      the single source of truth) passes the runtime check — every Pi
 *      built-in dispositioned, no duplicate names, all extension tools
 *      registered — and produces the expected allowlist.
 *   2. Forgetting to disposition a Pi built-in throws — the runtime makes
 *      Pi-version drift impossible to ship silently.
 *   3. Stale registrations (a Pi tool we've removed) throw.
 *   4. Duplicate tool names throw.
 *   5. The auto-designer-extension factory really registers the names we
 *      claim it does — caught here, not at hypothesis-design runtime.
 *
 * `buildHostSurface()` below is a thin wrapper over the production builder so
 * that removing a tool from `host.ts` fails this suite instead of silently
 * passing against a locally-rebuilt replica.
 */

/** The production surface host.ts builds, with real sandbox + todo wiring. */
function buildHostSurface(): ToolSurface {
  const bash = createAgentBashSandbox();
  const ctx = createSandboxToolContext(bash, () => {});
  return buildDesignToolSurface({
    bash,
    sandboxCtx: ctx,
    todoState: { current: [] },
    onTodos: () => {},
  });
}

describe('ToolSurface contract', () => {
  describe('the host surface', () => {
    it('builds successfully against the installed Pi version', () => {
      const built = buildHostSurface().build();
      expect(built.allowlist).toEqual([
        'read',
        'write',
        'edit',
        'ls',
        'find',
        'grep',
        'bash',
        'todo_write',
        'validate_js',
        'validate_html',
        'validate_artifact',
      ]);
      expect(typeof built.extensionFactory).toBe('function');
    });

    it('the extension factory registers all 11 tools through pi.registerTool', () => {
      const registered: Array<{ name: string }> = [];
      const { extensionFactory } = buildHostSurface().build();
      extensionFactory({
        registerTool: (tool: { name: string }) => registered.push(tool),
      } as unknown as Parameters<typeof extensionFactory>[0]);
      // Sandboxed Pi overrides (7) + auto-designer extensions (4) = 11 names total.
      expect(registered.map((t) => t.name).sort()).toEqual([
        'bash',
        'edit',
        'find',
        'grep',
        'ls',
        'read',
        'todo_write',
        'validate_artifact',
        'validate_html',
        'validate_js',
        'write',
      ]);
    });

    it('every sandboxed Pi tool definition matches its registry entry name', () => {
      // Pi resolves override-by-name; mismatched names would silently drop the override.
      const registered: Array<{ name: string }> = [];
      const { extensionFactory } = buildHostSurface().build();
      extensionFactory({
        registerTool: (tool: { name: string }) => registered.push(tool),
      } as unknown as Parameters<typeof extensionFactory>[0]);
      const piBuiltinNames = new Set(['read', 'write', 'edit', 'ls', 'find', 'grep', 'bash']);
      const piOverrides = registered.filter((t) => piBuiltinNames.has(t.name));
      expect(piOverrides.length).toBe(7);
    });

    it('the standalone designer extension factory registers the same four extension tools', () => {
      // host.ts does not call createDesignerExtensionFactory, so nothing else
      // pins it. Two independent registrations of the same tools drift apart
      // silently — this keeps the documented integration path honest.
      const registered: Array<{ name: string }> = [];
      const bash = createAgentBashSandbox();
      const factory = createDesignerExtensionFactory({
        bash,
        todoState: { current: [] },
        onTodos: () => {},
      });
      factory({
        registerTool: (tool: { name: string }) => registered.push(tool),
      } as unknown as Parameters<typeof factory>[0]);

      expect(registered.map((t) => t.name).sort()).toEqual([
        'todo_write',
        'validate_artifact',
        'validate_html',
        'validate_js',
      ]);
    });
  });

  describe('upgrade tripwire — Pi adds a new built-in', () => {
    it('throws ToolSurfaceError when a Pi built-in has no handler', () => {
      // Simulate "Pi just added a new tool we forgot to disposition" by
      // omitting `bash` from the surface. The build should fail before any
      // session would start.
      const bash = createAgentBashSandbox();
      const ctx = createSandboxToolContext(bash, () => {});
      const surface = new ToolSurface()
        .add({ kind: 'sandboxed-pi', name: 'read', build: () => buildSandboxedReadTool(ctx) })
        .add({ kind: 'sandboxed-pi', name: 'write', build: () => buildSandboxedWriteTool(ctx) })
        .add({ kind: 'sandboxed-pi', name: 'edit', build: () => buildSandboxedEditTool(ctx) })
        .add({ kind: 'sandboxed-pi', name: 'ls', build: () => buildSandboxedLsTool(ctx) })
        .add({ kind: 'sandboxed-pi', name: 'find', build: () => buildSandboxedFindTool(ctx) })
        .add({ kind: 'sandboxed-pi', name: 'grep', build: () => buildSandboxedGrepTool(ctx) });
      // bash deliberately missing.

      expect(() => surface.build()).toThrowError(/no disposition.*'bash'/);
    });

    it('the error message instructs the upgrader on next steps', () => {
      const surface = new ToolSurface(); // empty
      try {
        surface.build();
        throw new Error('expected build() to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ToolSurfaceError);
        const msg = (err as Error).message;
        expect(msg).toContain('sandboxed-pi');
        expect(msg).toContain('excluded-pi');
        expect(msg).toContain('reason');
      }
    });
  });

  describe('stale-registration guard', () => {
    it('throws when a sandboxed-pi handler refers to a non-existent Pi built-in', () => {
      const bash = createAgentBashSandbox();
      const ctx = createSandboxToolContext(bash, () => {});
      const surface = new ToolSurface()
        // Disposition every real Pi built-in so only the stale entry is bad.
        .add({ kind: 'sandboxed-pi', name: 'read', build: () => buildSandboxedReadTool(ctx) })
        .add({ kind: 'sandboxed-pi', name: 'write', build: () => buildSandboxedWriteTool(ctx) })
        .add({ kind: 'sandboxed-pi', name: 'edit', build: () => buildSandboxedEditTool(ctx) })
        .add({ kind: 'sandboxed-pi', name: 'ls', build: () => buildSandboxedLsTool(ctx) })
        .add({ kind: 'sandboxed-pi', name: 'find', build: () => buildSandboxedFindTool(ctx) })
        .add({ kind: 'sandboxed-pi', name: 'grep', build: () => buildSandboxedGrepTool(ctx) })
        .add({ kind: 'sandboxed-pi', name: 'bash', build: () => buildSandboxedBashTool(ctx) })
        .add({
          // 'phantom_tool' is not a Pi built-in.
          kind: 'sandboxed-pi',
          name: 'phantom_tool' as PiBuiltinToolName,
          build: () => buildSandboxedReadTool(ctx),
        });

      expect(() => surface.build()).toThrowError(/'phantom_tool'.*upstream Pi.*does not export/);
    });
  });

  describe('duplicate-name guard', () => {
    it('throws when two handlers share the same name', () => {
      const bash = createAgentBashSandbox();
      const ctx = createSandboxToolContext(bash, () => {});
      const surface = new ToolSurface()
        .add({ kind: 'sandboxed-pi', name: 'read', build: () => buildSandboxedReadTool(ctx) })
        .add({
          kind: 'auto-designer-extension',
          name: 'read',
          register: () => {},
        });
      expect(() => surface.build()).toThrowError(/Duplicate tool registration: 'read'/);
    });
  });
});
