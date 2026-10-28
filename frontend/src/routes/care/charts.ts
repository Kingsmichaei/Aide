import {
  AllCommunityModule,
  ModuleRegistry,
  type AgChartOptions,
} from "ag-charts-community";

import type { ChartPoint, Spending } from "../../lib/api";
import { formatMoney } from "../../lib/format";

// AG Charts Community (free, MIT): bar and donut series need no licence.
ModuleRegistry.registerModules([AllCommunityModule]);

/** "2026-10" -> "Oct 2026" */
export function monthLabel(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(
    Date.UTC(year ?? 1970, (number ?? 1) - 1, 1),
  ).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function rows(points: ChartPoint[], label: (raw: string) => string = (x) => x) {
  return points.map((p) => ({ label: label(p.label), total: Number(p.total) }));
}

/** Totals as bars in the app's blue, money on the axis and in tooltips. */
export function barOptions(
  points: ChartPoint[],
  currency: string,
  dark: boolean,
  label?: (raw: string) => string,
): AgChartOptions {
  const money = (value: number) =>
    formatMoney(String(value), currency, "en-US");
  return {
    theme: dark ? "ag-default-dark" : "ag-default",
    data: rows(points, label),
    series: [
      {
        type: "bar",
        xKey: "label",
        yKey: "total",
        yName: `Spent (${currency})`,
        fill: dark ? "#93c5fd" : "#1e40af",
        tooltip: {
          renderer: ({ datum }) => ({
            title: String(datum.label),
            content: money(Number(datum.total)),
          }),
        },
      },
    ],
    // AG Charts 14: axes are keyed by name, not listed.
    axes: {
      x: { type: "category", position: "bottom" },
      y: {
        type: "number",
        position: "left",
        label: { formatter: ({ value }) => money(Number(value)) },
      },
    },
    legend: { enabled: false },
  };
}

/** Shares of a total as a donut, money in tooltips. */
export function donutOptions(
  points: ChartPoint[],
  currency: string,
  dark: boolean,
): AgChartOptions {
  return {
    theme: dark ? "ag-default-dark" : "ag-default",
    data: rows(points),
    series: [
      {
        type: "donut",
        angleKey: "total",
        legendItemKey: "label",
        calloutLabelKey: "label",
        innerRadiusRatio: 0.6,
        tooltip: {
          renderer: ({ datum }) => ({
            title: String(datum.label),
            content: formatMoney(String(datum.total), currency, "en-US"),
          }),
        },
      },
    ],
  };
}

export function monthOptions(
  spending: Spending,
  dark: boolean,
): AgChartOptions {
  return barOptions(spending.by_month, spending.currency, dark, monthLabel);
}

export function categoryOptions(
  spending: Spending,
  dark: boolean,
): AgChartOptions {
  return donutOptions(spending.by_category, spending.currency, dark);
}
