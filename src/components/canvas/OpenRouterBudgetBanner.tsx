import { AlertTriangle } from 'lucide-react';
import { useAppConfig } from '../../hooks/useAppConfig';
import { useOpenRouterBudgetStatus } from '../../hooks/useOpenRouterBudgetStatus';
import { formatOpenRouterResetAt } from '../../lib/openrouter-budget-display';
import { useCanvasStore } from '../../stores/canvas-store';

export default function OpenRouterBudgetBanner() {
  const { data } = useOpenRouterBudgetStatus();
  const { data: appConfig } = useAppConfig();
  const hasOpenRouterNode = useCanvasStore((s) =>
    s.nodes.some((node) => {
      const data = node.data as Record<string, unknown> | undefined;
      return data?.providerId === 'openrouter' || data?.lastRunProviderId === 'openrouter';
    }),
  );

  if (data?.status !== 'out_of_credits') return null;
  if (appConfig?.lockdown !== true && !hasOpenRouterNode) return null;

  const resetLabel = formatOpenRouterResetAt(data.resetAt);

  return (
    <div className="absolute left-0 right-0 top-[var(--height-header)] z-10 border-b border-warning/35 bg-warning/12 px-4 py-2 text-fg shadow-sm backdrop-blur-sm">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-2 text-xs">
        <AlertTriangle size={14} className="shrink-0 text-warning" aria-hidden />
        <span className="font-medium">Out of OpenRouter credits.</span>
        <span className="text-fg-secondary">
          Runs using OpenRouter will fail until {resetLabel}.
        </span>
      </div>
    </div>
  );
}
