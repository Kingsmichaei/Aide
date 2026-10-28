import { useEffect, useId, useRef, type Ref } from "react";

import { ProductCard } from "../../components/ProductCard";
import type { Product } from "../../lib/api";
import { reasonFor } from "../../lib/readout";

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
  /** Present when the browser can speak; adds Replay and Stop to Aide's messages. */
  voice?: {
    onReplay: (message: ChatMessage, slowly: boolean) => void;
    onStop: () => void;
  };
}

export function MessageList({ messages, onChoose, busy, voice }: Props) {
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
        <Message
          key={message.id}
          message={message}
          latestRef={message === latest ? latestRef : undefined}
          onChoose={onChoose}
          busy={busy}
          voice={message.from === "aide" ? voice : undefined}
        />
      ))}
    </ol>
  );
}

interface MessageProps {
  message: ChatMessage;
  latestRef: Ref<HTMLLIElement> | undefined;
  onChoose: (product: Product) => void;
  busy: boolean;
  voice: Props["voice"];
}

const VOICE_BUTTON =
  "min-h-12 rounded-xl border-2 border-neutral-500 px-4 text-lg font-semibold hover:bg-neutral-200 focus-visible:outline-4 focus-visible:outline-blue-800 dark:hover:bg-neutral-700";

function Message({ message, latestRef, onChoose, busy, voice }: MessageProps) {
  const textId = useId();
  const options = message.products.filter((product) => product.best_offer);

  return (
    <li
      ref={latestRef}
      tabIndex={latestRef ? -1 : undefined}
      className={`flex flex-col gap-4 rounded-2xl p-4 focus-visible:outline-4 focus-visible:outline-blue-800 ${
        message.from === "aide"
          ? "bg-neutral-100 dark:bg-neutral-800"
          : "ms-8 border-2 border-neutral-300 dark:border-neutral-600"
      }`}
    >
      <p id={textId}>
        <span className="font-semibold">
          {message.from === "aide" ? "Aide" : "You"}:{" "}
        </span>
        {message.text}
      </p>
      {options.length > 0 && (
        <ul aria-label="Options" className="grid gap-4 sm:grid-cols-3">
          {options.map((product, index) => (
            <li key={product.id}>
              <ProductCard
                product={product}
                position={index + 1}
                reason={reasonFor(product, options)}
                onChoose={onChoose}
                disabled={busy}
              />
            </li>
          ))}
        </ul>
      )}
      {voice && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-describedby={textId}
            onClick={() => voice.onReplay(message, false)}
            className={VOICE_BUTTON}
          >
            Replay
          </button>
          <button
            type="button"
            aria-describedby={textId}
            onClick={() => voice.onReplay(message, true)}
            className={VOICE_BUTTON}
          >
            Replay slowly
          </button>
          <button type="button" onClick={voice.onStop} className={VOICE_BUTTON}>
            Stop
          </button>
        </div>
      )}
    </li>
  );
}
