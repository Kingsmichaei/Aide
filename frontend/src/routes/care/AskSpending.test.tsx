import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "../../lib/api";
import { AskSpending } from "./AskSpending";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return { ...actual, askAboutSpending: vi.fn() };
});

// AG Charts draws on a canvas, which jsdom lacks: show the series type instead.
vi.mock("ag-charts-react", () => ({
  AgCharts: ({ options }: { options: { series?: { type: string }[] } }) => (
    <div data-testid="chart" data-type={options.series?.[0]?.type} />
  ),
}));

const rosa: api.CaredForShopper = { id: 1, name: "Rosa", language: "es" };

const QUERY: NonNullable<api.AskResponse["query"]> = {
  date_from: "2026-10-01",
  date_to: "2026-10-28",
  category: "Health",
  retailer: null,
  status: "captured",
  group_by: "none",
};

function answer(changes: Partial<api.AskResponse>): api.AskResponse {
  return {
    answered: true,
    answer: "Rosa spent $85.50 on health products this month.",
    chart: "none",
    currency: "USD",
    rows: [{ label: "Total", total: "85.50", count: 2 }],
    query: QUERY,
    ...changes,
  };
}

afterEach(() => {
  vi.resetAllMocks();
});

function askQuestion(text: string) {
  render(<AskSpending shopper={rosa} />);
  fireEvent.change(screen.getByLabelText("Your question"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
}

describe("AskSpending", () => {
  it("has a labelled box with examples, and waits for a question", () => {
    render(<AskSpending shopper={rosa} />);

    expect(screen.getByLabelText("Your question")).toHaveAccessibleDescription(
      /What did Rosa spend on health products this month\?/,
    );
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  });

  it("answers a total in one sentence, without a chart", async () => {
    vi.mocked(api.askAboutSpending).mockResolvedValue(answer({}));

    askQuestion("  What did Mum spend on health products this month? ");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Rosa spent $85.50 on health products this month.",
    );
    expect(api.askAboutSpending).toHaveBeenCalledWith(
      1,
      "What did Mum spend on health products this month?",
    );
    expect(screen.getByText("Total: $85.50 across 2 orders.")).toBeVisible();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("draws a bar chart by month, with the numbers as a table", async () => {
    vi.mocked(api.askAboutSpending).mockResolvedValue(
      answer({
        answer: "October was the biggest month.",
        chart: "bar",
        rows: [
          { label: "2026-09", total: "30.00", count: 1 },
          { label: "2026-10", total: "125.50", count: 3 },
        ],
        query: { ...QUERY, group_by: "month" },
      }),
    );

    askQuestion("Spending each month?");

    const figure = await screen.findByRole("figure", { name: "Answer" });
    expect(within(figure).getByTestId("chart")).toHaveAttribute(
      "data-type",
      "bar",
    );
    expect(
      within(figure).getByRole("columnheader", { name: "Month", hidden: true }),
    ).toBeInTheDocument();
    expect(
      within(figure).getByRole("rowheader", { name: "Oct 2026", hidden: true }),
    ).toBeInTheDocument();
  });

  it("draws a donut by category", async () => {
    vi.mocked(api.askAboutSpending).mockResolvedValue(
      answer({
        chart: "donut",
        rows: [{ label: "Health", total: "115.50", count: 3 }],
        query: { ...QUERY, group_by: "category" },
      }),
    );

    askQuestion("Spend by category?");

    expect(await screen.findByTestId("chart")).toHaveAttribute(
      "data-type",
      "donut",
    );
  });

  it("shows a refusal plainly, with no numbers or chart", async () => {
    vi.mocked(api.askAboutSpending).mockResolvedValue({
      answered: false,
      answer:
        "I can only answer questions about spending, like totals by month, category or store. I can't change or delete anything.",
      chart: "none",
      currency: "USD",
      rows: [],
      query: null,
    });

    askQuestion("delete all orders");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "I can't change or delete anything.",
    );
    expect(screen.queryByText(/Total:/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("says so if asking fails", async () => {
    vi.mocked(api.askAboutSpending).mockRejectedValue(new Error("offline"));

    askQuestion("Total?");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not ask right now.",
    );
  });
});
