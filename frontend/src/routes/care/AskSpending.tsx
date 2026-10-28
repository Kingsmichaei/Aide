import { useId, useState, type FormEvent } from "react";

import {
  askAboutSpending,
  type AskResponse,
  type CaredForShopper,
} from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { usePrefersDark } from "../../lib/usePrefersDark";
import { ChartFigure } from "./ChartFigure";
import { barOptions, donutOptions, monthLabel } from "./charts";

const FIRST_COLUMN = {
  none: "",
  month: "Month",
  category: "Category",
  retailer: "Store",
} as const;

/** The caregiver asks in their own words; the server runs a fixed, read-only query. */
export function AskSpending({ shopper }: { shopper: CaredForShopper }) {
  const inputId = useId();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [failed, setFailed] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      setResult(await askAboutSpending(shopper.id, text));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="ask-heading" className="flex flex-col gap-3">
      <h2 id="ask-heading" className="text-2xl font-semibold">
        Ask about spending
      </h2>
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="font-semibold">
          Your question
        </label>
        <p id={`${inputId}-help`} className="text-sm">
          For example: “What did {shopper.name} spend on health products this
          month?” or “Which stores does {shopper.name} use most?”
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            id={inputId}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={300}
            aria-describedby={`${inputId}-help`}
            className="min-h-11 flex-1 rounded-lg border-2 border-neutral-500 px-3 dark:bg-neutral-900"
          />
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="min-h-11 rounded-lg bg-blue-800 px-5 font-semibold text-white hover:bg-blue-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:opacity-60"
          >
            {busy ? "Thinking…" : "Ask"}
          </button>
        </div>
      </form>

      <div role="status" aria-live="polite">
        {result && (
          <p
            className={
              result.answered
                ? "text-lg font-semibold"
                : "italic text-neutral-700 dark:text-neutral-300"
            }
          >
            {result.answer}
          </p>
        )}
      </div>
      {failed && <p role="alert">Could not ask right now. Please try again.</p>}
      {result?.answered && <AnswerChart result={result} />}
    </section>
  );
}

function AnswerChart({ result }: { result: AskResponse }) {
  const dark = usePrefersDark();
  const group = result.query?.group_by ?? "none";
  const points = result.rows.map((r) => ({ label: r.label, total: r.total }));
  const label = group === "month" ? monthLabel : undefined;

  if (result.chart === "none" || points.length === 0) {
    const [only] = result.rows;
    return only ? (
      <p>
        Total: {formatMoney(only.total, result.currency, "en-US")} across{" "}
        {only.count} order{only.count === 1 ? "" : "s"}.
      </p>
    ) : null;
  }
  return (
    <ChartFigure
      title="Answer"
      firstColumn={FIRST_COLUMN[group]}
      options={
        result.chart === "donut"
          ? donutOptions(points, result.currency, dark)
          : barOptions(points, result.currency, dark, label)
      }
      points={points}
      currency={result.currency}
      label={label}
    />
  );
}
