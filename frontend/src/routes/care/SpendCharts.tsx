import type { AgChartOptions } from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import { useId } from "react";

import type { ChartPoint, Spending } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { usePrefersDark } from "../../lib/usePrefersDark";
import { categoryOptions, monthLabel, monthOptions } from "./charts";

/** Spend by month and by category, each with the same numbers as a table. */
export function SpendCharts({ spending }: { spending: Spending | null }) {
  const dark = usePrefersDark();
  if (!spending) return <p aria-busy="true">Loading spending…</p>;
  const nothing = spending.by_month.every((p) => Number(p.total) === 0);

  return (
    <section aria-labelledby="charts-heading" className="flex flex-col gap-4">
      <h2 id="charts-heading" className="text-2xl font-semibold">
        Spending
      </h2>
      {nothing ? (
        <p>No paid orders in the last six months.</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Chart
            title="Spent each month"
            options={monthOptions(spending, dark)}
            points={spending.by_month}
            currency={spending.currency}
            label={monthLabel}
          />
          <Chart
            title="Spent by category"
            options={categoryOptions(spending, dark)}
            points={spending.by_category}
            currency={spending.currency}
          />
        </div>
      )}
    </section>
  );
}

function Chart({
  title,
  options,
  points,
  currency,
  label = (x) => x,
}: {
  title: string;
  options: AgChartOptions;
  points: ChartPoint[];
  currency: string;
  label?: (raw: string) => string;
}) {
  const titleId = useId();
  return (
    <figure
      aria-labelledby={titleId}
      className="flex flex-col gap-2 rounded-xl border border-neutral-300 p-4 dark:border-neutral-700"
    >
      <figcaption id={titleId} className="font-semibold">
        {title}
      </figcaption>
      <div className="h-72">
        <AgCharts options={options} />
      </div>
      {/* The same numbers as text, for screen readers and anyone who prefers a table. */}
      <details>
        <summary className="min-h-11 cursor-pointer py-2 underline">
          Show as a table
        </summary>
        <table className="w-full text-start">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="text-start">
                {title.includes("month") ? "Month" : "Category"}
              </th>
              <th scope="col" className="text-end">
                Spent
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label}>
                <th scope="row" className="text-start font-normal">
                  {label(p.label)}
                </th>
                <td className="text-end">
                  {formatMoney(p.total, currency, "en-US")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
