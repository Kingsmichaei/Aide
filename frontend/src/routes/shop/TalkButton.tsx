import { useEffect, useRef, useState } from "react";

import { MESSAGES } from "../../i18n";
import type { Language } from "../../lib/api";
import {
  listen,
  stopSpeaking,
  type ListenError,
  type Listening,
} from "../../lib/speech";

interface Props {
  language: Language;
  disabled: boolean;
  /** Outlined, for screens where another button is the main action. */
  secondary?: boolean;
  /** The transcript so far, as the shopper speaks. */
  onHeard: (text: string) => void;
  /** Listening has ended and something was heard. */
  onFinished: (text: string) => void;
  onError: (error: ListenError) => void;
}

/**
 * Press once to start listening, press again to stop. No hold-to-talk, which
 * is hard with a tremor or limited grip. Space and Enter work because it is a
 * real button. Callers should hide it when `canListen()` is false.
 */
export function TalkButton({
  language,
  disabled,
  secondary = false,
  onHeard,
  onFinished,
  onError,
}: Props) {
  const t = MESSAGES[language].shop;
  const [listening, setListening] = useState(false);
  const session = useRef<Listening | undefined>(undefined);
  const heard = useRef("");

  // Leaving the screen mid-sentence throws the words away instead of sending.
  useEffect(
    () => () => {
      heard.current = "";
      session.current?.cancel();
    },
    [],
  );

  function start() {
    stopSpeaking(); // Aide stops talking when the shopper starts.
    heard.current = "";
    const started = listen(language, {
      onTranscript: (text) => {
        heard.current = text;
        onHeard(text);
      },
      onError,
      onEnd: () => {
        session.current = undefined;
        setListening(false);
        if (heard.current) onFinished(heard.current);
      },
    });
    if (started) {
      session.current = started;
      setListening(true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={disabled && !listening}
        onClick={() => {
          if (session.current) session.current.stop();
          else start();
        }}
        className={`flex items-center justify-center gap-4 rounded-2xl px-8 text-2xl font-semibold focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-800 disabled:opacity-60 dark:focus-visible:outline-blue-300 ${
          secondary
            ? "min-h-16 border-2 border-blue-800 hover:bg-blue-50 dark:border-blue-300 dark:hover:bg-blue-950"
            : "min-h-20 bg-blue-800 text-white hover:bg-blue-900"
        }`}
      >
        {listening && (
          <span
            aria-hidden="true"
            className="size-5 rounded-full bg-red-400 motion-safe:animate-pulse"
          />
        )}
        {listening ? t.stopListening : t.talk}
      </button>
      {/* Deliberately not a live region: a screen reader talking now would be
          picked up by the microphone. The button's new name says it instead. */}
      {listening && (
        <p className="text-center text-2xl font-bold">{t.listening}</p>
      )}
    </div>
  );
}
