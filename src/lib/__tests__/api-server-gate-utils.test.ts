import { describe, it, expect } from 'vitest';
import {
  API_SERVER_GATE_DESIGN_TOKENS_PATH,
  shouldBypassApiServerGate,
} from '../api-server-gate-utils';

describe('shouldBypassApiServerGate', () => {
  it('bypasses only for design tokens path in dev', () => {
    expect(shouldBypassApiServerGate(API_SERVER_GATE_DESIGN_TOKENS_PATH, true)).toBe(true);
    expect(shouldBypassApiServerGate('/canvas', true)).toBe(false);
    expect(shouldBypassApiServerGate(API_SERVER_GATE_DESIGN_TOKENS_PATH, false)).toBe(false);
  });
});
