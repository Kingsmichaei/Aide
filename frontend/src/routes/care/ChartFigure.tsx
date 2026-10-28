import type { AgChartOptions } from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import { useId } from "react";

import type { ChartPoint } from "../../lib/api";
import { formatMoney } from "../../lib/format";

/** A titled chart with the same numbers as a table underneath. */
export function ChartFigure({
  title,
  options,
  points,
  currency,
  label = (x) => x,
  firstColumn,
}: {
  title: string;
  /** Heading of the table's first column, e.g. "Month". */
  firstColumn: string;
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
                {firstColumn}
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
