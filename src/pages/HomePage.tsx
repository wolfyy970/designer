import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleHelp } from 'lucide-react';
import { Badge } from '@ds/components/ui/badge';
import { Button } from '@ds/components/ui/button';
import { useOpenRouterBudgetStatus } from '../hooks/useOpenRouterBudgetStatus';
import { appReleaseLabel } from '../lib/app-release';
import { formatOpenRouterResetAt } from '../lib/openrouter-budget-display';

export default function HomePage() {
  const releaseLabel = appReleaseLabel();
  const { data: budgetStatus, isError } = useOpenRouterBudgetStatus();

  const showStatus = budgetStatus?.status !== 'not_configured';
  const isOutOfCredits = budgetStatus?.status === 'out_of_credits';
  const statusUnavailable =
    isError ||
    budgetStatus?.status === 'unknown' ||
    budgetStatus?.status === 'rate_limited' ||
    budgetStatus == null;

  return (
    <main className="min-h-screen bg-bg text-fg">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 sm:px-10 sm:py-14 lg:px-16 lg:py-20">
        <section className="flex flex-1 items-center py-16 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <Badge tone="accent" shape="pill" className="mb-8">
              Alpha
            </Badge>
            <h1 className="font-logo text-[clamp(4rem,14vw,9.5rem)] font-medium leading-[0.85] tracking-wide text-fg">
              Designer
            </h1>
            {releaseLabel ? (
              <p
                className="mt-4 text-xs font-medium leading-none text-fg-muted tabular-nums sm:text-sm"
                aria-label={`Designer release ${releaseLabel}`}
              >
                {releaseLabel}
              </p>
            ) : null}
            <p className="mt-12 max-w-xl text-sm leading-relaxed text-fg-secondary sm:text-base">
              Designer is an experimental UX design harness for exploring solution hypotheses and design directions.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button asChild size="lg">
                <Link to="/canvas">
                  Open canvas
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </Button>
              <p className="text-xs leading-relaxed text-fg-muted">
                Desktop only
              </p>
            </div>
            {showStatus ? (
              isOutOfCredits ? (
                <div className="mt-12 max-w-xl rounded-md border border-warning/35 bg-warning/12 p-4 shadow-sm">
                  <div className="flex gap-3">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="warning" shape="pill">Runs paused</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-fg-secondary">
                        OpenRouter credits are used up for the day. They reset {formatOpenRouterResetAt(budgetStatus.resetAt)}.
                      </p>
                    </div>
                  </div>
                </div>
              ) : statusUnavailable ? (
                <p className="mt-8 flex items-center gap-2 text-xs leading-relaxed text-fg-muted">
                  <CircleHelp size={14} className="shrink-0" aria-hidden />
                  Status temporarily unavailable.
                </p>
              ) : (
                <p className="mt-8 flex items-center gap-2 text-xs leading-relaxed text-fg-muted">
                  <CheckCircle2 size={14} className="shrink-0 text-success" aria-hidden />
                  Ready
                </p>
              )
            ) : null}
          </div>
        </section>

        <footer className="border-t border-border/70 py-8">
          <p className="max-w-3xl text-xs leading-relaxed text-fg-muted">
            Designer is an experiment under active development. Use it as a thinking partner, review its output, and expect bugs and rough edges. Features may change or disappear at any time, and work may be lost.
          </p>
        </footer>
      </div>
    </main>
  );
}
