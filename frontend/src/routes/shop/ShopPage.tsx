import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import {
  confirmOrder,
  sendChat,
  type ConfirmReason,
  type Order,
  type Product,
} from "../../lib/api";
import { demoShopperId } from "../../lib/config";
import { formatMoney } from "../../lib/format";
import { replyChunks } from "../../lib/readout";
import { useSettings } from "../../lib/settings-context";
import {
  canListen,
  canSpeak,
  speak,
  speechMessage,
  stopSpeaking,
  type ListenError,
} from "../../lib/speech";
import { ConfirmPanel } from "./ConfirmPanel";
import { MessageList, type ChatMessage } from "./MessageList";
import { PayPalCheckout } from "./PayPalCheckout";
import { TalkButton } from "./TalkButton";

type Stage = "chat" | "confirm" | "pay" | "done";

const RECHECK_TEXT: Record<ConfirmReason, (order: Order) => string> = {
  price_changed: (o) =>
    `The price changed. It is now ${formatMoney(o.total, o.currency)}. Please check again.`,
  retailer_changed: (o) =>
    `The first store stopped selling it. ${o.retailer} has it for ${formatMoney(o.total, o.currency)}. Please check again.`,
  details_changed: () => "Something changed. Please check the order again.",
  unavailable: () => "Sorry, this item is not available any more.",
};

export function ShopPage() {
  const shopperId = demoShopperId();
  const { settings } = useSettings();
  const voiceInput = canListen();
  const voiceOutput = canSpeak();
  const inputId = useId();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<Stage>("chat");
  const [order, setOrder] = useState<Order | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (stage === "done") resultRef.current?.focus();
  }, [stage]);

  function addMessage(
    from: ChatMessage["from"],
    text: string,
    products: Product[] = [],
  ) {
    const message = { id: nextId.current++, from, text, products };
    setMessages((current) => [...current, message]);
    if (from === "aide") {
      setAnnouncement(text);
      if (settings.read_aloud)
        say(replyChunks(text, products, settings.language));
    }
  }

  function say(pieces: string[], slowly = false) {
    const rate = slowly
      ? Math.max(0.5, settings.voice_speed * 0.75)
      : settings.voice_speed;
    speak(pieces, settings.language, { rate });
  }

  async function talk(message: string, shown = message) {
    setError(null);
    addMessage("shopper", shown);
    setBusy(true);
    try {
      const response = await sendChat(shopperId, message);
      addMessage("aide", response.reply, response.products);
      if (response.draft_order) {
        setOrder(response.draft_order);
        setStage("confirm");
      }
    } catch {
      setError("Sorry, Aide could not answer. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void talk(text);
  }

  function heardEverything(text: string) {
    if (settings.auto_send) {
      setDraft("");
      void talk(text);
    } else {
      // Let the shopper check and fix the words before sending.
      inputRef.current?.focus();
    }
  }

  function listenFailed(listenError: ListenError) {
    const message = speechMessage(listenError, settings.language);
    setError(message);
    speak(message, settings.language, { rate: settings.voice_speed });
  }

  function choose(product: Product) {
    void talk(
      `I choose this one: ${product.title} (product id: ${product.id})`,
      `I choose ${product.title}.`,
    );
  }

  async function confirm() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmOrder(order);
      setOrder(result.order);
      if (result.confirmed) {
        setStage("pay");
      } else if (result.reason) {
        addMessage("aide", RECHECK_TEXT[result.reason](result.order));
        if (result.reason === "unavailable") setStage("chat");
      }
    } catch {
      setError("Sorry, we could not check the order. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function recheck(updated: Order) {
    setOrder(updated);
    setStage("confirm");
    addMessage("aide", RECHECK_TEXT.price_changed(updated));
  }

  function finish(updated: Order) {
    setOrder(updated);
    setStage("done");
    setAnnouncement(resultText(updated));
    if (settings.read_aloud) say([resultText(updated)]);
  }

  function cancelOrder() {
    setOrder(null);
    setStage("chat");
    addMessage(
      "aide",
      "Okay. Nothing was bought. What else can I help you find?",
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <title>Aide – Shop</title>
      <h1 className="text-3xl font-bold">Aide</h1>

      {messages.length === 0 && (
        <p>
          Tell me what you need. I will help you find it and read you the price.
        </p>
      )}
      <MessageList
        messages={messages}
        onChoose={choose}
        busy={busy || stage !== "chat"}
        voice={
          voiceOutput
            ? {
                onReplay: (message, slowly) => {
                  say(
                    replyChunks(
                      message.text,
                      message.products,
                      settings.language,
                    ),
                    slowly,
                  );
                },
                onStop: stopSpeaking,
              }
            : undefined
        }
      />

      {busy && stage === "chat" && <p>Aide is thinking…</p>}
      {error && (
        <p
          role="alert"
          className="font-semibold text-red-800 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {stage === "confirm" && order && (
        <ConfirmPanel
          order={order}
          busy={busy}
          onConfirm={confirm}
          onCancel={cancelOrder}
        />
      )}
      {stage === "pay" && order && (
        <PayPalCheckout
          order={order}
          onDone={finish}
          onRecheck={recheck}
          onError={setError}
        />
      )}
      {stage === "done" && order && (
        <section
          aria-labelledby="result-heading"
          className="rounded-2xl border-4 border-green-800 p-6 dark:border-green-300"
        >
          <h2
            id="result-heading"
            ref={resultRef}
            tabIndex={-1}
            className="text-3xl font-bold"
          >
            {order.status === "captured"
              ? "Paid"
              : "Sent to your caregiver for approval"}
          </h2>
          <p className="mt-2">{resultText(order)}</p>
          <button
            type="button"
            onClick={() => {
              setOrder(null);
              setStage("chat");
            }}
            className="mt-4 min-h-16 w-full rounded-2xl border-2 border-blue-800 px-8 text-xl font-semibold focus-visible:outline-4 focus-visible:outline-blue-800 dark:border-blue-300"
          >
            Shop for something else
          </button>
        </section>
      )}

      {stage === "chat" && (
        <form onSubmit={onSubmit} className="mt-auto flex flex-col gap-3">
          {voiceInput ? (
            <TalkButton
              language={settings.language}
              disabled={busy}
              onHeard={(text) => {
                setError(null);
                setDraft(text);
              }}
              onFinished={heardEverything}
              onError={listenFailed}
            />
          ) : (
            <p>{speechMessage("unsupported", settings.language)}</p>
          )}
          <label htmlFor={inputId} className="font-semibold">
            Type your message
          </label>
          <textarea
            id={inputId}
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            className="rounded-xl border-2 border-neutral-500 p-4 text-xl focus-visible:outline-4 focus-visible:outline-blue-800 dark:bg-neutral-900"
          />
          <button
            type="submit"
            disabled={busy}
            className={
              // Talk to Aide is the main action when the browser can listen.
              voiceInput
                ? "min-h-16 rounded-2xl border-2 border-blue-800 px-8 text-2xl font-semibold focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-800 disabled:opacity-60 dark:border-blue-300 dark:focus-visible:outline-blue-300"
                : "min-h-16 rounded-2xl bg-blue-800 px-8 text-2xl font-semibold text-white hover:bg-blue-900 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-800 disabled:opacity-60 dark:focus-visible:outline-blue-300"
            }
          >
            Send
          </button>
        </form>
      )}

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </main>
  );
}

function resultText(order: Order): string {
  const amount = formatMoney(
    order.confirmed_total ?? order.total,
    order.currency,
  );
  return order.status === "captured"
    ? `You paid ${amount} for ${order.title}. It is on its way.`
    : `${order.title} costs ${amount}. That is over your limit, so your caregiver will check it first. You only pay if they say yes.`;
}
