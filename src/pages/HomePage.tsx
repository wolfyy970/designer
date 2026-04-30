import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@ds/components/ui/button";
import { useOpenRouterBudgetStatus } from "../hooks/useOpenRouterBudgetStatus";
import { appReleaseLabel } from "../lib/app-release";
import { formatOpenRouterResetAt } from "../lib/openrouter-budget-display";

export default function HomePage() {
  const releaseLabel = appReleaseLabel();
  const { data: budgetStatus, isError } = useOpenRouterBudgetStatus();

  const showStatus = budgetStatus?.status !== "not_configured";
  const isOutOfCredits = budgetStatus?.status === "out_of_credits";
  const showCreditWarning = showStatus && isOutOfCredits && !isError;

  return (
    <main className="min-h-screen bg-bg text-fg">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 sm:px-10 sm:py-14 lg:px-16 lg:py-16">
        <section className="flex flex-1 items-center">
          <div className="max-w-4xl">
            <h1 className="font-logo text-[clamp(4rem,14vw,9.5rem)] font-medium leading-[0.85] tracking-wide text-fg">
              Designer
            </h1>
            <p className="mt-12 max-w-2xl text-xl leading-snug text-fg-secondary sm:text-2xl">
              Agentic UX harness for the exploration of solution hypotheses.
            </p>
            <div className="mt-12 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Button asChild size="lg">
                <Link to="/canvas">
                  Open canvas
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </Button>
              <p className="text-xs leading-relaxed text-fg-faint">
                Desktop only
              </p>
            </div>
            {showCreditWarning ? (
              <div className="mt-10 max-w-xl rounded-md border border-warning/35 bg-warning/12 px-4 py-3">
                <div className="flex gap-3">
                  <AlertTriangle
                    size={17}
                    className="mt-0.5 shrink-0 text-warning"
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm leading-relaxed text-fg-secondary">
                      Out of credits. Runs resume{" "}
                      {formatOpenRouterResetAt(budgetStatus.resetAt)}.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <footer className="py-8">
          <p className="max-w-3xl border-t border-border/50 pt-8 text-xs leading-relaxed text-fg-faint">
            Designer is an experiment. Expect bugs and rough edges. Features may
            change or disappear at any time. Work may be lost.
          </p>
          {releaseLabel ? (
            <p
              className="mt-3 text-nano leading-none text-fg-faint tabular-nums"
              aria-label={`Designer release ${releaseLabel}`}
            >
              {releaseLabel}
            </p>
          ) : null}
        </footer>
      </div>
    </main>
  );
}
