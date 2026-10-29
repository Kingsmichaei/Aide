import { useMutation } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { LANGUAGE_NAMES, MESSAGES } from "@/i18n";
import { useI18n } from "@/i18n/useI18n";
import {
  draftOrder,
  sendChat,
  type Language,
  type Order,
  type Product,
} from "@/lib/api";
import { replyChunks } from "@/lib/readout";
import { useSettings } from "@/lib/settings-context";
import { canSpeak, speak, stopSpeaking, type ListenError } from "@/lib/speech";
import { useMediaQuery } from "@/lib/useMediaQuery";

import { CheckoutSheet } from "./components/CheckoutSheet";
import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { SuggestedPrompts } from "./components/SuggestedPrompts";
import { Thinking } from "./components/Thinking";
import type { ChatMessage } from "./types";

/** The home screen: a conversation with Aide, with checkout in a sheet. */
export function ShopPage() {
  const { t, language } = useI18n();
  const { settings, update } = useSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [checkout, setCheckout] = useState<Order | null>(null);
  const [failed, setFailed] = useState<string | null>(null); // the message to retry
  const [suggestedLanguage, setSuggestedLanguage] = useState<Language | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("");
  const nextId = useRef(1);
  const end = useRef<HTMLDivElement>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const firstName = settings.name.split(" ")[0] ?? "";

  const chat = useMutation({ mutationFn: sendChat });
  const draft = useMutation({ mutationFn: draftOrder });
  const busy = chat.isPending || draft.isPending;

  // Keep the newest message in view.
  useEffect(() => {
    end.current?.scrollIntoView({
      block: "end",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [messages.length, busy, reducedMotion]);

  function addMessage(message: Omit<ChatMessage, "id">) {
    const added = { ...message, id: nextId.current++ };
    setMessages((current) => [...current, added]);
    if (added.from === "aide") {
      setAnnouncement(added.text);
      if (settings.read_aloud) play(added);
    }
  }

  function play(message: ChatMessage) {
    speak(
      replyChunks(message.text, message.products, message.language),
      message.language,
      {
        rate: settings.voice_speed,
      },
    );
  }

  function send(text: string, shown = text) {
    setFailed(null);
    addMessage({ from: "user", text: shown, products: [], language });
    chat.mutate(text, {
      onSuccess: (response) => {
        setSuggestedLanguage(response.reply_language);
        addMessage({
          from: "aide",
          text: response.reply,
          products: response.products,
          language: response.reply_language ?? language,
        });
        if (response.draft_order) setCheckout(response.draft_order);
      },
      onError: () => setFailed(text),
    });
  }

  function retry() {
    if (!failed) return;
    // The shopper's message is already shown; send it again without repeating it.
    setMessages((current) => current.slice(0, -1));
    send(failed);
  }

  function buy(product: Product) {
    draft.mutate(product.id, {
      onSuccess: setCheckout,
      onError: () => toast.error(t.checkout.checkFailed),
    });
  }

  function voiceError(error: ListenError) {
    const message = t.speech[error];
    toast.error(message);
    if (settings.read_aloud)
      speak(message, language, { rate: settings.voice_speed });
  }

  const empty = messages.length === 0 && !busy;

  return (
    <main className="flex flex-1 flex-col">
      <title>{t.shop.pageTitle}</title>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">
        {empty ? (
          <section className="flex flex-1 flex-col justify-center gap-10 py-12">
            <div className="space-y-3">
              <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">
                {t.shop.greeting(firstName)}
              </h1>
              <p className="max-w-xl text-muted-foreground">{t.shop.intro}</p>
            </div>
            <SuggestedPrompts onPick={(prompt) => send(prompt)} />
          </section>
        ) : (
          <div className="flex-1 space-y-8 py-8">
            <h1 className="sr-only">{t.nav.shop}</h1>
            <MessageList
              messages={messages}
              busy={busy}
              onBuy={buy}
              voice={
                canSpeak() ? { onPlay: play, onStop: stopSpeaking } : undefined
              }
            />
            {chat.isPending && <Thinking />}
            {failed && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm"
              >
                <span>{t.shop.answerFailed}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={retry}
                >
                  <RotateCcw aria-hidden="true" />
                  {t.shop.retry}
                </Button>
              </div>
            )}
            {suggestedLanguage && !busy && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                lang={suggestedLanguage}
                onClick={() => {
                  setSuggestedLanguage(null);
                  void update({ language: suggestedLanguage }).catch(() =>
                    toast.error(
                      MESSAGES[suggestedLanguage].settings.saveFailed,
                    ),
                  );
                }}
              >
                {MESSAGES[suggestedLanguage].shop.switchLanguage(
                  LANGUAGE_NAMES[suggestedLanguage],
                )}
              </Button>
            )}
            <div ref={end} />
          </div>
        )}

        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-background from-70% pt-4 pb-4 md:bottom-0 md:pb-6">
          <Composer
            disabled={busy}
            onSend={(text) => send(text)}
            onVoiceError={voiceError}
          />
        </div>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <CheckoutSheet
        order={checkout}
        onClose={() => setCheckout(null)}
        onDeclined={() => {
          setCheckout(null);
          addMessage({
            from: "aide",
            text: t.shop.nothingBought,
            products: [],
            language,
          });
        }}
        onPaid={(paid) => {
          setAnnouncement(t.success.body(paid.title, paid.retailer));
        }}
      />
    </main>
  );
}
