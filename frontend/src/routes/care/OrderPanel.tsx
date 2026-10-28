import { useEffect, useRef, useState } from "react";

import {
  getOrderDetail,
  type CaredForShopper,
  type LedgerRow,
  type OrderDetail,
} from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { approvedByWord, methodWord, statusWord } from "./ledger";

// Order events in plain words (see the `record(...)` calls in the back end).
const EVENT_WORDS: Record<string, string> = {
  drafted: "Aide suggested this order",
  confirmed: "Confirmed by the shopper",
  paypal_order_created: "Sent to PayPal",
  authorized: "Payment held by PayPal",
  sent_to_caregiver: "Over a limit: sent to you",
  captured: "Paid",
  approved_and_captured: "Approved and paid",
  declined_and_voided: "Declined; payment released",
  authorization_expired: "Payment hold ran out; sent back to the shopper",
  price_changed: "Price changed; asked the shopper again",
  retailer_changed: "Store changed; asked the shopper again",
  unavailable: "No longer sold; nothing was paid",
  amount_mismatch_voided: "PayPal held a different amount; released it",
  voice_no: "Shopper said no",
  voice_unclear: "Shopper's answer was unclear",
};

interface Props {
  shopper: CaredForShopper;
  row: LedgerRow;
  onClose: () => void;
}

/** Side panel for one order: details, timeline and the conversation behind it. */
export function OrderPanel({ shopper, row, onClose }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [failed, setFailed] = useState(false);

  // Focus the panel on open; give focus back to where it came from on close.
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
    return () => returnTo?.focus();
  }, []);

  // Escape closes the panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    getOrderDetail(shopper.id, row.id)
      .then((loaded) => !cancelled && setDetail(loaded))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [shopper.id, row.id]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  return (
    <div
      role="dialog"
      aria-labelledby="order-panel-heading"
      className="fixed inset-y-0 end-0 z-20 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-s border-neutral-300 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
    >
      <div className="flex items-start justify-between gap-4">
        <h2
          id="order-panel-heading"
          ref={headingRef}
          tabIndex={-1}
          dir="auto"
          className="text-2xl font-semibold"
        >
          {row.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg border-2 border-neutral-500 px-3 font-semibold"
        >
          Close
        </button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="font-semibold">Status</dt>
        <dd>{statusWord(row, shopper.name)}</dd>
        <dt className="font-semibold">Total</dt>
        <dd>{formatMoney(row.total, row.currency, "en-US")}</dd>
        <dt className="font-semibold">Store</dt>
        <dd>{row.retailer}</dd>
        <dt className="font-semibold">Category</dt>
        <dd>{row.category ?? "—"}</dd>
        <dt className="font-semibold">Confirmed by</dt>
        <dd>{methodWord(row)}</dd>
        <dt className="font-semibold">Approved by</dt>
        <dd>{approvedByWord(row)}</dd>
        <dt className="font-semibold">Ordered</dt>
        <dd>{fmt(row.created_at)}</dd>
      </dl>

      {failed && (
        <p role="alert">Could not load the details. Please try again.</p>
      )}
      {!detail && !failed && <p aria-busy="true">Loading details…</p>}

      {detail && (
        <>
          {detail.confirmation_transcript && (
            <section aria-labelledby="said-heading">
              <h3 id="said-heading" className="font-semibold">
                What {shopper.name} said to confirm
              </h3>
              <p>
                <q lang={shopper.language} dir="auto">
                  {detail.confirmation_transcript}
                </q>
              </p>
            </section>
          )}

          {detail.decisions.length > 0 && (
            <section aria-labelledby="decisions-heading">
              <h3 id="decisions-heading" className="font-semibold">
                Decisions
              </h3>
              <ul className="flex flex-col gap-1">
                {detail.decisions.map((d) => (
                  <li key={d.at}>
                    {d.decision === "approved" ? "Approved" : "Declined"} by{" "}
                    {d.caregiver}, {fmt(d.at)}
                    {d.note && (
                      <>
                        : <q>{d.note}</q>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="timeline-heading">
            <h3 id="timeline-heading" className="font-semibold">
              What happened
            </h3>
            <ol className="flex flex-col gap-1">
              {detail.events.map((e, index) => (
                <li key={`${e.at}-${index}`}>
                  <time dateTime={e.at}>{fmt(e.at)}</time>:{" "}
                  {EVENT_WORDS[e.event] ?? e.event.replaceAll("_", " ")}
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="conversation-heading">
            <h3 id="conversation-heading" className="font-semibold">
              Conversation with Aide
            </h3>
            {detail.conversation.length === 0 ? (
              <p>No conversation saved.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {detail.conversation.map((m, index) => (
                  <li key={index}>
                    <span className="font-semibold">
                      {m.role === "shopper" ? shopper.name : "Aide"}:
                    </span>{" "}
                    <span lang={shopper.language} dir="auto">
                      {m.text}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
