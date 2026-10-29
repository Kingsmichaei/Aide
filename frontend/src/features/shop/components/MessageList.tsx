import { Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/useI18n";
import type { Product } from "@/lib/api";
import { reasonFor } from "@/lib/readout";

import type { ChatMessage } from "../types";
import { AideAvatar } from "./AideAvatar";
import { ProductCard } from "./ProductCard";

interface Props {
  messages: ChatMessage[];
  busy: boolean;
  onBuy: (product: Product) => void;
  /** Present when the browser can speak: adds Play and Stop to Aide's messages. */
  voice?: { onPlay: (message: ChatMessage) => void; onStop: () => void };
}

export function MessageList({ messages, busy, onBuy, voice }: Props) {
  const { t } = useI18n();
  if (messages.length === 0) return null;
  return (
    <ol aria-label={t.shop.conversation} className="flex flex-col gap-8">
      {messages.map((message) =>
        message.from === "user" ? (
          <li key={message.id} className="flex justify-end">
            <p
              lang={message.language}
              dir="auto"
              className="max-w-[85%] rounded-2xl rounded-ee-md bg-primary px-4 py-2.5 text-primary-foreground shadow-xs"
            >
              <span className="sr-only">{t.shop.you}: </span>
              {message.text}
            </p>
          </li>
        ) : (
          <li key={message.id} className="flex gap-3">
            <AideAvatar />
            <div className="min-w-0 flex-1 space-y-4 pt-1">
              <p
                lang={message.language}
                dir="auto"
                className="whitespace-pre-line"
              >
                <span className="sr-only">{t.shop.aide}: </span>
                {message.text}
              </p>
              <ProductGrid
                products={message.products}
                onBuy={onBuy}
                busy={busy}
              />
              {voice && (
                <div className="flex gap-1 text-muted-foreground">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => voice.onPlay(message)}
                    className="h-7 gap-1.5 px-2 text-xs"
                  >
                    <Play aria-hidden="true" className="size-3.5" />
                    {t.shop.play}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={voice.onStop}
                    className="h-7 gap-1.5 px-2 text-xs"
                  >
                    <Square aria-hidden="true" className="size-3.5" />
                    {t.shop.stop}
                  </Button>
                </div>
              )}
            </div>
          </li>
        ),
      )}
    </ol>
  );
}

function ProductGrid({
  products,
  onBuy,
  busy,
}: {
  products: Product[];
  onBuy: (product: Product) => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const options = products.filter((product) => product.best_offer);
  if (options.length === 0) return null;
  return (
    <ul
      aria-label={t.card.options}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {options.map((product) => (
        <li key={product.id}>
          <ProductCard
            product={product}
            reason={reasonFor(product, options)}
            onBuy={onBuy}
            disabled={busy}
          />
        </li>
      ))}
    </ul>
  );
}
