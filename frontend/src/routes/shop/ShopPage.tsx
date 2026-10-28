import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { LANGUAGE_NAMES, MESSAGES, money, type Messages } from "../../i18n";
import { useI18n } from "../../i18n/useI18n";
import {
  confirmOrder,
  sendChat,
  type ConfirmReason,
  type Language,
  type Order,
  type Product,
} from "../../lib/api";
import { demoShopperId } from "../../lib/config";
import { replyChunks } from "../../lib/readout";
import { useSettings } from "../../lib/settings-context";
import {
  canListen,
  canSpeak,
  speak,
  stopSpeaking,
  type ListenError,
} from "../../lib/speech";
import { ConfirmPanel } from "./ConfirmPanel";
import { MessageList, type ChatMessage } from "./MessageList";
import { PayPalCheckout } from "./PayPalCheckout";
import { TalkButton } from "./TalkButton";

type Stage = "chat" | "confirm" | "pay" | "done";

function recheckText(
  reason: ConfirmReason,
  order: Order,
  language: Language,
): string {
  const t = MESSAGES[language].shop;
  const total = money(order.total, order.currency, language);
  switch (reason) {
    case "price_changed":
      return t.priceChanged(total);
    case "retailer_changed":
      return t.retailerChanged(order.retailer, total);
    case "details_changed":
      return t.detailsChanged;
    case "unavailable":
      return t.unavailable;
  }
}

export function ShopPage() {
  const shopperId = demoShopperId();
  const { settings, update } = useSettings();
  const { t, language } = useI18n();
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
  // Set when Aide answered in a different language from the shopper's setting.
  const [suggestedLanguage, setSuggestedLanguage] = useState<Language | null>(
    null,
  );
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
    inLanguage: Language = language,
  ) {
    const message = {
      id: nextId.current++,
      from,
      text,
      products,
      language: inLanguage,
    };
    setMessages((current) => [...current, message]);
    if (from === "aide") {
      setAnnouncement(text);
      if (settings.read_aloud) sayMessage(message);
    }
  }

  function say(pieces: string[], inLanguage: Language, slowly = false) {
    const rate = slowly
      ? Math.max(0.5, settings.voice_speed * 0.75)
      : settings.voice_speed;
    speak(pieces, inLanguage, { rate });
  }

  function sayMessage(message: ChatMessage, slowly = false) {
    say(
      replyChunks(message.text, message.products, message.language),
      message.language,
      slowly,
    );
  }

  async function talk(message: string, shown = message) {
    setError(null);
    addMessage("shopper", shown);
    setBusy(true);
    try {
      const response = await sendChat(shopperId, message);
      setSuggestedLanguage(response.reply_language);
      addMessage(
        "aide",
        response.reply,
        response.products,
        response.reply_language ?? language,
      );
      if (response.draft_order) {
        setOrder(response.draft_order);
        setStage("confirm");
      }
    } catch {
      setError(t.shop.answerFailed);
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
    const message = t.speech[listenError];
    setError(message);
    say([message], language);
  }

  function choose(product: Product) {
    void talk(
      // The agent needs the id; the shopper sees the short version.
      `I choose this one: ${product.title} (product id: ${product.id})`,
      t.shop.chose(product.title),
    );
  }

  async function switchLanguage(to: Language) {
    setSuggestedLanguage(null);
    try {
      await update({ language: to });
    } catch {
      setError(MESSAGES[to].settings.saveFailed);
    }
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
        addMessage("aide", recheckText(result.reason, result.order, language));
        if (result.reason === "unavailable") setStage("chat");
      }
    } catch {
      setError(t.shop.checkFailed);
    } finally {
      setBusy(false);
    }
  }

  function recheck(updated: Order) {
    setOrder(updated);
    setStage("confirm");
    addMessage("aide", recheckText("price_changed", updated, language));
  }

  function finish(updated: Order) {
    setOrder(updated);
    setStage("done");
    const text = resultText(updated, t, language);
    setAnnouncement(text);
    if (settings.read_aloud) say([text], language);
  }

  function cancelOrder() {
    setOrder(null);
    setStage("chat");
    addMessage("aide", t.shop.nothingBought);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <title>{t.shop.pageTitle}</title>
      <h1 className="text-3xl font-bold">{t.shop.heading}</h1>

      {messages.length === 0 && <p>{t.shop.intro}</p>}
      <MessageList
        messages={messages}
        onChoose={choose}
        busy={busy || stage !== "chat"}
        voice={
          voiceOutput
            ? { onReplay: sayMessage, onStop: stopSpeaking }
            : undefined
        }
      />

      {suggestedLanguage && stage === "chat" && (
        <button
          type="button"
          lang={suggestedLanguage}
          dir="auto"
          onClick={() => void switchLanguage(suggestedLanguage)}
          className="min-h-16 rounded-2xl border-2 border-blue-800 px-8 text-xl font-semibold focus-visible:outline-4 focus-visible:outline-blue-800 dark:border-blue-300"
        >
          {MESSAGES[suggestedLanguage].shop.switchLanguage(
            LANGUAGE_NAMES[suggestedLanguage],
          )}
        </button>
      )}

      {busy && stage === "chat" && <p>{t.shop.thinking}</p>}
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
              ? t.shop.paidHeading
              : t.shop.approvalHeading}
          </h2>
          <p className="mt-2">{resultText(order, t, language)}</p>
          <button
            type="button"
            onClick={() => {
              setOrder(null);
              setStage("chat");
            }}
            className="mt-4 min-h-16 w-full rounded-2xl border-2 border-blue-800 px-8 text-xl font-semibold focus-visible:outline-4 focus-visible:outline-blue-800 dark:border-blue-300"
          >
            {t.shop.shopAgain}
          </button>
        </section>
      )}

      {stage === "chat" && (
        <form onSubmit={onSubmit} className="mt-auto flex flex-col gap-3">
          {voiceInput ? (
            <TalkButton
              language={language}
              disabled={busy}
              onHeard={(text) => {
                setError(null);
                setDraft(text);
              }}
              onFinished={heardEverything}
              onError={listenFailed}
            />
          ) : (
            <p>{t.speech.unsupported}</p>
          )}
          <label htmlFor={inputId} className="font-semibold">
            {t.shop.typeLabel}
          </label>
          <textarea
            id={inputId}
            ref={inputRef}
            dir="auto"
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
            {t.shop.send}
          </button>
        </form>
      )}

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </main>
  );
}

function resultText(order: Order, t: Messages, language: Language): string {
  const amount = money(
    order.confirmed_total ?? order.total,
    order.currency,
    language,
  );
  return order.status === "captured"
    ? t.shop.paid(amount, order.title)
    : t.shop.needsApproval(order.title, amount);
}
