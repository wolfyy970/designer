export function formatOpenRouterResetAt(resetAt: string | undefined): string {
  if (!resetAt) return 'when the OpenRouter budget resets';
  const date = new Date(resetAt);
  if (!Number.isFinite(date.getTime())) return 'when the OpenRouter budget resets';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);
}
