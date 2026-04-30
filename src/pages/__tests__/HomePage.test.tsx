/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenRouterBudgetStatusResponse } from "../../api/response-schemas";
import { appReleaseLabel } from "../../lib/app-release";
import HomePage from "../HomePage";

const mocks = vi.hoisted(
  (): {
    budgetStatus: {
      data: OpenRouterBudgetStatusResponse | undefined;
      isError: boolean;
    };
  } => ({
    budgetStatus: {
      data: {
        status: "available",
        checkedAt: "2026-04-29T15:30:00.000Z",
        message: "OpenRouter credits are available.",
      },
      isError: false,
    },
  }),
);

vi.mock("../../hooks/useOpenRouterBudgetStatus", () => ({
  useOpenRouterBudgetStatus: () => mocks.budgetStatus,
}));

describe("HomePage", () => {
  afterEach(() => {
    cleanup();
    mocks.budgetStatus = {
      data: {
        status: "available",
        checkedAt: "2026-04-29T15:30:00.000Z",
        message: "OpenRouter credits are available.",
      },
      isError: false,
    };
  });

  it("renders the public Designer introduction", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Designer" })).not.toBeNull();
    expect(
      screen.getByLabelText(`Designer release ${appReleaseLabel()}`),
    ).not.toBeNull();
    expect(screen.getByText(appReleaseLabel())).not.toBeNull();
    expect(screen.queryByText("“Design is how it works.”")).toBeNull();
    expect(screen.queryByRole("link", { name: /watch/i })).toBeNull();
    expect(
      screen.getByText(
        "Agentic UX harness for the exploration of solution hypotheses.",
      ),
    ).not.toBeNull();
    expect(screen.getByText(/Expect bugs and rough edges/i)).not.toBeNull();
    expect(screen.getByText(/work may be lost/i)).not.toBeNull();
    expect(screen.getByText("Desktop only")).not.toBeNull();
    expect(screen.queryByText("Ready")).toBeNull();
    expect(
      screen
        .getAllByRole("link", { name: /open canvas/i })[0]
        ?.getAttribute("href"),
    ).toBe("/canvas");
  });

  it("shows OpenRouter daily credit exhaustion without exposing remaining budget", () => {
    mocks.budgetStatus = {
      data: {
        status: "out_of_credits",
        checkedAt: "2026-04-29T15:30:00.000Z",
        message: "OpenRouter credits are exhausted.",
        limitRemaining: 0,
        resetAt: "2026-04-30T00:00:00.000Z",
      },
      isError: false,
    };

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/Out of credits/)
        .textContent,
    ).toContain("UTC");
    expect(screen.queryByText("0")).toBeNull();
  });

  it("keeps rendering when OpenRouter status is unavailable", () => {
    mocks.budgetStatus = {
      data: undefined,
      isError: true,
    };

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Designer" })).not.toBeNull();
    expect(screen.queryByText("Status temporarily unavailable.")).toBeNull();
  });
});
