/** Dev-only route that may load without the API (design token kitchen sink). */
export const API_SERVER_GATE_DESIGN_TOKENS_PATH = '/dev/design-tokens';

export function shouldBypassApiServerGate(pathname: string, isDev: boolean): boolean {
  return isDev && pathname === API_SERVER_GATE_DESIGN_TOKENS_PATH;
}
