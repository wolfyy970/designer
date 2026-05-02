import { describe, it, expect } from 'vitest';
import * as pi from '../src/index';

describe('@auto-designer/pi public API', () => {
  it('exports every session factory as a function', () => {
    expect(typeof pi.createSession).toBe('function');
    expect(typeof pi.createDesignSession).toBe('function');
    expect(typeof pi.createEvaluationSession).toBe('function');
    expect(typeof pi.createIncubationSession).toBe('function');
    expect(typeof pi.createInputsGenSession).toBe('function');
    expect(typeof pi.createDesignSystemSession).toBe('function');
    expect(typeof pi.createInternalContextSession).toBe('function');
  });

  it('exports the VFS surface', () => {
    expect(pi.SANDBOX_PROJECT_ROOT).toBe('/home/user/project');
    expect(typeof pi.createAgentBashSandbox).toBe('function');
    expect(typeof pi.createVirtualPiCodingTools).toBe('function');
    expect(typeof pi.createSandboxBashTool).toBe('function');
  });

  it('exports the resource loader and designer extension wiring', () => {
    expect(typeof pi.SessionScopedResourceLoader).toBe('function');
    expect(typeof pi.createDesignerExtensionFactory).toBe('function');
    expect(typeof pi.createDesignerCompactionExtensionFactory).toBe('function');
  });

  it('exports the model builder + completion budget helpers', () => {
    expect(typeof pi.buildModel).toBe('function');
    expect(typeof pi.completionBudgetFromPromptTokens).toBe('function');
    expect(typeof pi.maxCompletionBudgetForContextWindow).toBe('function');
    expect(pi.DEFAULT_COMPLETION_BUDGET.minCompletion).toBeGreaterThan(0);
  });
});
