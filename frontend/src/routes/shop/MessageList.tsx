import { useEffect, useRef } from "react";

import { ProductCard } from "../../components/ProductCard";
import type { Product } from "../../lib/api";

export interface ChatMessage {
  id: number;
  from: "shopper" | "aide";
  text: string;
  products: Product[];
}

interface Props {
  messages: ChatMessage[];
  onChoose: (product: Product) => void;
  busy: boolean;
}

export function MessageList({ messages, onChoose, busy }: Props) {
  const latestRef = useRef<HTMLLIElement>(null);
  const latest = messages.at(-1);

  // Move focus to each new reply from Aide so keyboard and screen reader users land on it.
  useEffect(() => {
    if (latest?.from === "aide") latestRef.current?.focus();
  }, [latest]);

  if (messages.length === 0) return null;

  return (
    <ol aria-label="Conversation" className="flex flex-col gap-4">
      {messages.map((message) => (
        <li
          key={message.id}
          ref={message === latest ? latestRef : undefined}
          tabIndex={message === latest ? -1 : undefined}
          className={`flex flex-col gap-4 rounded-2xl p-4 focus-visible:outline-4 focus-visible:outline-blue-800 ${
            message.from === "aide"
              ? "bg-neutral-100 dark:bg-neutral-800"
              : "ms-8 border-2 border-neutral-300 dark:border-neutral-600"
          }`}
        >
          <p>
            <span className="font-semibold">
              {message.from === "aide" ? "Aide" : "You"}:{" "}
            </span>
            {message.text}
          </p>
          {message.products.length > 0 && (
            <ul aria-label="Options" className="grid gap-4 sm:grid-cols-3">
              {message.products.map((product) => (
                <li key={product.id}>
                  <ProductCard
                    product={product}
                    onChoose={onChoose}
                    disabled={busy}
                  />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
