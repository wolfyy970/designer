import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@ds/components/ui/button";
import { useOpenRouterBudgetStatus } from "../hooks/useOpenRouterBudgetStatus";
import { appReleaseLabel } from "../lib/app-release";
import { formatOpenRouterResetAt } from "../lib/openrouter-budget-display";
import {
  EXPERIMENT_PERIOD_LABEL,
  EXPERIMENT_WRITE_UPS,
} from "../lib/experiment-writeups";

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
            {/*
              Prominent and unmissable on purpose: this page describes work from
              a fixed window, not a live claim. Without the date, a finished
              experiment reads as the current state of whoever built it.
            */}
            <p className="mt-5 text-sm font-medium tracking-wide text-fg-muted sm:text-base">
              Run in {EXPERIMENT_PERIOD_LABEL}
            </p>
            {/*
              Read before judging the interface. The experiment's question is
              whether part of the *UX process* can be carried out agentically —
              so polish on this app's own UI and UX was deliberately not where
              the time went. Without saying that plainly, a visitor reasonably
              reads the rough edges as the thing being demonstrated, and grades
              the work on a bar it was never aimed at.
            */}
            <section
              className="mt-10 max-w-2xl rounded-md border border-border-subtle bg-surface-raised/60 px-5 py-4"
              aria-labelledby="scope-note-heading"
            >
              <h2
                id="scope-note-heading"
                className="text-sm font-medium tracking-wide text-fg-secondary"
              >
                Note
              </h2>
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-fg-muted">
                <p>
                  This is an experiment, and the interface is not what it set out
                  to prove. The question was whether part of the UX process
                  itself can be embodied agentically — whether an agent can take
                  a solution hypothesis through exploration, evaluation, and
                  revision. That is where the effort went.
                </p>
                <p>
                  The UI and UX here were built to make that legible, not to be
                  finished. Please read the rough edges as the state of the
                  experiment rather than as the work being demonstrated.
                </p>
              </div>
            </section>
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
            <section
              className="mt-14 max-w-2xl"
              aria-labelledby="experiment-writeups-heading"
            >
              <h2
                id="experiment-writeups-heading"
                className="text-sm font-medium tracking-wide text-fg-secondary"
              >
                Experiment write-ups
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-fg-faint">
                Two posts covering the {EXPERIMENT_PERIOD_LABEL} run — the setup,
                the results, and what they showed. Published on Substack.
              </p>
              <ul className="mt-5 space-y-3">
                {EXPERIMENT_WRITE_UPS.map((post) => (
                  <li key={post.id}>
                    <a
                      href={post.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-2.5 rounded-md border border-border-subtle bg-surface-raised px-3.5 py-3 transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-fg">
                          {post.label}
                          <span className="sr-only">
                            {" "}
                            of the Designer experiment write-up (opens in a new
                            tab)
                          </span>
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-fg-muted">
                          {post.blurb}
                        </span>
                      </span>
                      <ArrowUpRight
                        size={15}
                        className="mt-0.5 shrink-0 text-fg-faint transition-colors group-hover:text-accent"
                        aria-hidden
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
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
