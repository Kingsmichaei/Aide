import type { Spending } from "../../lib/api";
import { usePrefersDark } from "../../lib/usePrefersDark";
import { ChartFigure } from "./ChartFigure";
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
          <ChartFigure
            title="Spent each month"
            firstColumn="Month"
            options={monthOptions(spending, dark)}
            points={spending.by_month}
            currency={spending.currency}
            label={monthLabel}
          />
          <ChartFigure
            title="Spent by category"
            firstColumn="Category"
            options={categoryOptions(spending, dark)}
            points={spending.by_category}
            currency={spending.currency}
          />
        </div>
      )}
    </section>
  );
}
