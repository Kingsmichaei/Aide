import { useEffect, useRef } from "react";

import type { Order } from "../../lib/api";
import { formatMoney } from "../../lib/format";

interface Props {
  order: Order;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmPanel({ order, busy, onConfirm, onCancel }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const delivery = (Number(order.total) - Number(order.price)).toFixed(2);

  useEffect(() => {
    headingRef.current?.focus();
  }, [order.id]);

  return (
    <section
      aria-labelledby="confirm-heading"
      className="flex flex-col gap-4 rounded-2xl border-4 border-blue-800 p-6 dark:border-blue-300"
    >
      <h2
        id="confirm-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-bold"
      >
        Check your order
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="font-semibold">Item</dt>
        <dd>{order.title}</dd>
        <dt className="font-semibold">Store</dt>
        <dd>{order.retailer}</dd>
        <dt className="font-semibold">Price</dt>
        <dd>{formatMoney(order.price, order.currency)}</dd>
        <dt className="font-semibold">Delivery</dt>
        <dd>{formatMoney(delivery, order.currency)}</dd>
        <dt className="text-2xl font-bold">Total</dt>
        <dd className="text-2xl font-bold">
          {formatMoney(order.total, order.currency)}
        </dd>
      </dl>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="min-h-16 w-full rounded-2xl bg-blue-800 px-8 text-2xl font-semibold text-white hover:bg-blue-900 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-800 disabled:opacity-60 dark:focus-visible:outline-blue-300"
      >
        {busy ? "Checking the price…" : "Yes, buy it"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="self-center px-4 py-2 text-xl underline focus-visible:outline-4 focus-visible:outline-blue-800"
      >
        No, not this one
      </button>
    </section>
  );
}
