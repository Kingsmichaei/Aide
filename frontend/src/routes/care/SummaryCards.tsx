import type { Spending } from "../../lib/api";
import { formatMoney } from "../../lib/format";

/** The three numbers a caregiver checks first. */
export function SummaryCards({
  spending,
  shopperName,
}: {
  spending: Spending | null;
  shopperName: string;
}) {
  const money = (amount: string) =>
    formatMoney(amount, spending?.currency ?? "USD", "en-US");
  const cards = [
    {
      label: "Spent this month",
      value: spending ? money(spending.spent_this_month) : "…",
      note: spending?.monthly_max
        ? `of ${money(spending.monthly_max)} a month`
        : "No monthly limit set",
    },
    {
      label: "Limit left this month",
      value: spending?.limit_left ? money(spending.limit_left) : "—",
      note: spending?.per_order_max
        ? `Each order up to ${money(spending.per_order_max)}`
        : `${shopperName}'s orders need no approval yet`,
    },
    {
      label: "Orders waiting for you",
      value: spending ? String(spending.waiting) : "…",
      note:
        spending && spending.waiting > 0
          ? "See the list on the right"
          : "Nothing to decide",
    },
  ];

  return (
    <section aria-label="Summary" aria-busy={!spending}>
      <ul className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <li
            key={card.label}
            className="flex flex-col gap-1 rounded-xl border border-neutral-300 p-4 dark:border-neutral-700"
          >
            <span className="text-sm font-semibold">{card.label}</span>
            <span className="text-3xl font-bold">{card.value}</span>
            <span className="text-sm">{card.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
