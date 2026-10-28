import { useCallback, useEffect, useId, useState } from "react";

import {
  ApiError,
  decideApproval,
  getApprovals,
  type WaitingOrder,
} from "../../lib/api";
import { formatMoney } from "../../lib/format";

type Decision = "approve" | "decline";

/** Orders over a limit, waiting for this caregiver. Approve pays; decline releases the hold. */
export function ApprovalQueue() {
  const [orders, setOrders] = useState<WaitingOrder[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    getApprovals()
      .then((waiting) => {
        setOrders(waiting);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(load, [load]);

  async function decide(order: WaitingOrder, decision: Decision, note: string) {
    setProblem(null);
    setResult(null);
    try {
      const outcome = await decideApproval(order.order_id, decision, note);
      setResult(outcome.message);
      setOrders((current) =>
        (current ?? []).filter((o) => o.order_id !== order.order_id),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setProblem("This order was already handled. Nothing was changed.");
        load();
      } else {
        setProblem(
          error instanceof ApiError && typeof error.detail === "string"
            ? error.detail
            : "Something went wrong. Nothing was changed; please try again.",
        );
      }
    }
  }

  return (
    <section aria-labelledby="queue-heading" className="flex flex-col gap-4">
      <h2 id="queue-heading" className="text-2xl font-semibold">
        Waiting for you{orders ? ` (${orders.length})` : ""}
      </h2>
      <p role="status">{result}</p>
      {problem && (
        <p
          role="alert"
          className="font-semibold text-red-800 dark:text-red-300"
        >
          {problem}
        </p>
      )}
      {loadFailed && (
        <p role="alert">Could not load the orders waiting for you.</p>
      )}
      {orders?.length === 0 && <p>Nothing is waiting for you.</p>}
      {orders && orders.length > 0 && (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <li key={order.order_id}>
              <WaitingCard order={order} onDecide={decide} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WaitingCard({
  order,
  onDecide,
}: {
  order: WaitingOrder;
  onDecide: (
    order: WaitingOrder,
    decision: Decision,
    note: string,
  ) => Promise<void>;
}) {
  const titleId = useId();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const name = order.shopper.name;
  const total = formatMoney(order.total, order.currency, "en-US");

  async function act(decision: Decision) {
    setBusy(true);
    try {
      await onDecide(order, decision, note.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-xl border-2 border-amber-700 p-4 dark:border-amber-400"
    >
      <p className="text-sm font-semibold uppercase">
        Waiting for approval · {name}
      </p>
      <h3 id={titleId} dir="auto" className="text-xl font-semibold">
        {order.title}
      </h3>
      <p>{order.summary}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="font-semibold">Total</dt>
        <dd>{total}</dd>
        <dt className="font-semibold">Store</dt>
        <dd>{order.retailer}</dd>
        <dt className="font-semibold">{name} said</dt>
        <dd>
          {order.confirmation_transcript ? (
            <q lang={order.shopper.language} dir="auto">
              {order.confirmation_transcript}
            </q>
          ) : (
            "Pressed “Yes, buy it”"
          )}
        </dd>
        <dt className="font-semibold">Waiting since</dt>
        <dd>
          <time dateTime={order.waiting_since}>
            {new Date(order.waiting_since).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        </dd>
      </dl>
      <div className="flex flex-col gap-1">
        <label htmlFor={noteId} className="font-semibold">
          Note for {name} (optional)
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          rows={2}
          aria-describedby={`${noteId}-help`}
          className="rounded-lg border-2 border-neutral-500 p-2 dark:bg-neutral-900"
        />
        <p id={`${noteId}-help`} className="text-sm">
          {name} sees this note with your answer.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("approve")}
          aria-describedby={titleId}
          className="min-h-11 rounded-lg bg-green-800 px-5 font-semibold text-white hover:bg-green-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-green-800 disabled:opacity-60"
        >
          Approve and pay {total}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("decline")}
          aria-describedby={titleId}
          className="min-h-11 rounded-lg border-2 border-red-800 px-5 font-semibold text-red-800 hover:bg-red-50 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:opacity-60 dark:border-red-300 dark:text-red-300 dark:hover:bg-red-950"
        >
          Decline
        </button>
      </div>
    </article>
  );
}
