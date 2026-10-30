import { BellRing, ImageOff, Sparkles } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/useI18n";
import type { Product } from "@/lib/api";
import type { Reason } from "@/lib/readout";

interface Props {
  product: Product;
  reason: Reason;
  onBuy: (product: Product) => void;
  disabled?: boolean;
}

/** One option: image, title, store, price, one reason, Buy and Watch price. */
export function ProductCard({
  product,
  reason,
  onBuy,
  disabled = false,
}: Props) {
  const { t, money } = useI18n();
  const titleId = useId();
  const soonId = useId();
  const [imageFailed, setImageFailed] = useState(false);
  const offer = product.best_offer;
  if (!offer) return null;

  const why =
    reason.kind === "cheapest"
      ? t.card.lowest
      : reason.kind === "sale"
        ? t.card.sale(money(reason.was, reason.currency))
        : null;

  return (
    <article
      aria-labelledby={titleId}
      className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition hover:shadow-md"
    >
      <div className="relative aspect-[4/3] shrink-0 bg-white">
        {product.image_url && !imageFailed ? (
          <img
            src={product.image_url}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="size-full object-contain p-4 transition duration-300 motion-safe:group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
            <ImageOff aria-hidden="true" className="size-6" />
            <span className="sr-only">{t.card.noImage}</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3
            id={titleId}
            dir="auto"
            className="line-clamp-2 font-medium leading-snug"
          >
            {product.title}
          </h3>
          <p className="truncate text-sm text-muted-foreground">
            {offer.retailer}
          </p>
        </div>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="price text-lg font-semibold">
              {money(offer.price, offer.currency)}
            </p>
            {reason.kind === "sale" && (
              <p className="price text-sm text-muted-foreground line-through">
                {money(reason.was, reason.currency)}
              </p>
            )}
          </div>
          {why && (
            <p className="flex items-center gap-1.5 text-sm text-primary-soft-foreground">
              <Sparkles aria-hidden="true" className="size-3.5 shrink-0" />
              {why}
            </p>
          )}
        </div>
        <div className="mt-auto pt-1">
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => onBuy(product)}
              disabled={disabled}
              aria-label={t.card.buyLabel(product.title)}
              className="flex-1"
            >
              {t.card.buy}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* aria-disabled (not disabled) so it stays focusable and its
                    "Coming soon" tooltip reaches keyboard and screen-reader users. */}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-disabled="true"
                  aria-label={t.card.watch}
                  aria-describedby={soonId}
                  onClick={(event) => event.preventDefault()}
                  className="cursor-not-allowed text-muted-foreground hover:bg-transparent hover:text-muted-foreground"
                >
                  <BellRing aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t.card.watch}
                <span id={soonId} className="text-background/70">
                  {" "}
                  · {t.card.comingSoon}
                </span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </article>
  );
}
