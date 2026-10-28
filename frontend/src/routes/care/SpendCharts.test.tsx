import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Spending } from "../../lib/api";
import { categoryOptions, monthLabel, monthOptions } from "./charts";
import { SpendCharts } from "./SpendCharts";
import { SummaryCards } from "./SummaryCards";

// AG Charts draws on a canvas, which jsdom lacks: record the options instead.
vi.mock("ag-charts-react", () => ({
  AgCharts: ({ options }: { options: { data?: unknown[] } }) => (
    <div data-testid="chart" data-points={options.data?.length ?? 0} />
  ),
}));

const spending: Spending = {
  currency: "USD",
  spent_this_month: "105.00",
  monthly_max: "500.00",
  per_order_max: "100.00",
  limit_left: "395.00",
  waiting: 1,
  by_month: [
    { label: "2026-09", total: "0" },
    { label: "2026-10", total: "105.00" },
  ],
  by_category: [
    { label: "Health", total: "85.50" },
    { label: "Kitchen", total: "19.50" },
  ],
};

describe("chart options", () => {
  it("labels months for people, not machines", () => {
    expect(monthLabel("2026-10")).toBe("Oct 2026");
    expect(monthLabel("2026-01")).toBe("Jan 2026");
  });

  it("spend by month is a bar chart in the app's blue, with money on the axis", () => {
    const options = monthOptions(spending, false);

    expect(options.data).toEqual([
      { label: "Sep 2026", total: 0 },
      { label: "Oct 2026", total: 105 },
    ]);
    expect(options.series?.[0]).toMatchObject({
      type: "bar",
      xKey: "label",
      yKey: "total",
      fill: "#1e40af",
    });
    expect(options.theme).toBe("ag-default");
    expect(monthOptions(spending, true).theme).toBe("ag-default-dark");
  });

  it("spend by category is a donut chart", () => {
    const options = categoryOptions(spending, false);

    expect(options.series?.[0]).toMatchObject({
      type: "donut",
      angleKey: "total",
      legendItemKey: "label",
    });
    expect(options.data).toEqual([
      { label: "Health", total: 85.5 },
      { label: "Kitchen", total: 19.5 },
    ]);
  });
});

describe("SpendCharts", () => {
  it("shows both charts with titles and the same numbers as a table", () => {
    render(<SpendCharts spending={spending} />);

    const month = screen.getByRole("figure", { name: "Spent each month" });
    const category = screen.getByRole("figure", { name: "Spent by category" });
    expect(within(month).getByTestId("chart")).toHaveAttribute(
      "data-points",
      "2",
    );

    fireEvent.click(within(category).getByText("Show as a table"));
    const table = within(category).getByRole("table", {
      name: "Spent by category",
    });
    expect(
      within(table).getByRole("rowheader", { name: "Health" }),
    ).toBeVisible();
    expect(within(table).getByText("$85.50")).toBeVisible();
    expect(
      within(month).getByRole("rowheader", { name: "Oct 2026", hidden: true }),
    ).toBeInTheDocument();
  });

  it("says so when nothing was paid yet", () => {
    render(
      <SpendCharts
        spending={{
          ...spending,
          by_month: [{ label: "2026-10", total: "0" }],
          by_category: [],
        }}
      />,
    );

    expect(
      screen.getByText("No paid orders in the last six months."),
    ).toBeVisible();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });
});

describe("SummaryCards", () => {
  it("shows spent, limit left and orders waiting", () => {
    render(<SummaryCards spending={spending} shopperName="Rosa" />);

    const cards = within(screen.getByRole("region", { name: "Summary" }))
      .getAllByRole("listitem")
      .map((card) => card.textContent);
    expect(cards).toEqual([
      "Spent this month$105.00of $500.00 a month",
      "Limit left this month$395.00Each order up to $100.00",
      "Orders waiting for you1See the list on the right",
    ]);
  });

  it("explains when no limits are set", () => {
    render(
      <SummaryCards
        spending={{
          ...spending,
          monthly_max: null,
          per_order_max: null,
          limit_left: null,
          waiting: 0,
        }}
        shopperName="Rosa"
      />,
    );

    expect(screen.getByText("No monthly limit set")).toBeVisible();
    expect(
      screen.getByText("Rosa's orders need no approval yet"),
    ).toBeVisible();
    expect(screen.getByText("Nothing to decide")).toBeVisible();
  });
});
