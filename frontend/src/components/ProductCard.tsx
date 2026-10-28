import { useId } from "react";

import { useI18n } from "../i18n/useI18n";
import type { Product } from "../lib/api";
import type { Reason } from "../lib/readout";

interface Props {
  product: Product;
  /** 1-based, matching "Option 1" when the options are read aloud. */
  position: number;
  reason: Reason;
  onChoose: (product: Product) => void;
  disabled?: boolean;
}

export function ProductCard({
  product,
  position,
  reason,
  onChoose,
  disabled = false,
}: Props) {
  const { t, money } = useI18n();
  const titleId = useId();
  const offer = product.best_offer;
  if (!offer) return null;

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-2xl border-2 border-neutral-300 p-4 dark:border-neutral-600"
    >
      {product.image_url && (
        <img
          src={product.image_url}
          alt=""
          className="aspect-square w-full rounded-xl bg-white object-contain"
        />
      )}
      <p className="font-semibold">{t.card.option(position)}</p>
      {/* Titles come from the store, usually in English, whatever the page language. */}
      <h3 id={titleId} dir="auto" className="text-xl font-semibold">
        {product.title}
      </h3>
      <p className="text-2xl font-bold">{money(offer.price, offer.currency)}</p>
      {reason.kind === "cheapest" && (
        <p className="font-semibold">{t.card.lowest}</p>
      )}
      {reason.kind === "sale" && (
        <p className="font-semibold">
          {t.card.sale(money(reason.was, reason.currency))}
        </p>
      )}
      <p>{t.card.from(offer.retailer)}</p>
      <button
        type="button"
        onClick={() => onChoose(product)}
        disabled={disabled}
        aria-describedby={titleId}
        className="min-h-16 rounded-xl border-2 border-blue-800 px-6 text-xl font-semibold text-blue-900 hover:bg-blue-50 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:opacity-60 dark:border-blue-300 dark:text-blue-100 dark:hover:bg-blue-950"
      >
        {t.card.choose}
      </button>
    </article>
  );
}
