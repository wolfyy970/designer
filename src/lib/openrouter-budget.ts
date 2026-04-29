export const OPENROUTER_CREDIT_EXHAUSTED_MESSAGE =
  'OpenRouter credits are exhausted. This run cannot continue until the budget resets.';

export const OPENROUTER_BUDGET_REFRESH_EVENT = 'openrouter-budget:refresh';

export function isOpenRouterCreditExhaustionLike(value: unknown): boolean {
  const text =
    value instanceof Error
      ? value.message
      : typeof value === 'string'
        ? value
        : value != null
          ? JSON.stringify(value)
          : '';
  const msg = text.toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('insufficient credits') ||
    msg.includes('out of credits') ||
    (msg.includes('402') && (msg.includes('openrouter') || msg.includes('api key') || msg.includes('account'))) ||
    (msg.includes('limit_remaining') && msg.includes('0'))
  );
}

export function normalizeOpenRouterCreditError(value: unknown): string | undefined {
  return isOpenRouterCreditExhaustionLike(value) ? OPENROUTER_CREDIT_EXHAUSTED_MESSAGE : undefined;
}

export function notifyOpenRouterBudgetRefresh(): void {
  const browser = (globalThis as {
    window?: {
      CustomEvent: new (type: string) => object;
      dispatchEvent: (event: object) => boolean;
    };
  }).window;
  if (!browser) return;
  browser.dispatchEvent(new browser.CustomEvent(OPENROUTER_BUDGET_REFRESH_EVENT));
}
