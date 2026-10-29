import { ArrowUp } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/useI18n";
import { useSettings } from "@/lib/settings-context";
import { canListen, type ListenError } from "@/lib/speech";
import { cn } from "@/lib/utils";

import { MicButton } from "./MicButton";

interface Props {
  disabled: boolean;
  onSend: (text: string) => void;
  onVoiceError: (error: ListenError) => void;
}

const MAX_HEIGHT = 200; // px; the box grows with the text up to this

/** Text first, voice optional: a growing text box, a mic and a send button. */
export function Composer({ disabled, onSend, onVoiceError }: Props) {
  const { t, language } = useI18n();
  const { settings } = useSettings();
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const voice = canListen();

  // Grow with the text, so long messages stay readable without scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [draft]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || disabled) return;
    setDraft("");
    onSend(text);
  }

  function heardEverything(text: string) {
    if (settings.auto_send) {
      setDraft("");
      onSend(text);
    } else {
      box.current?.focus(); // let the user check the words first
    }
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        "flex items-end gap-1 rounded-2xl border bg-card p-1.5 shadow-sm transition focus-within:border-ring/60 focus-within:shadow-md",
        listening && "border-destructive/40",
      )}
    >
      <label htmlFor={inputId} className="sr-only">
        {t.shop.composerLabel}
      </label>
      <textarea
        id={inputId}
        ref={box}
        dir="auto"
        rows={1}
        value={draft}
        placeholder={listening ? t.shop.listening : t.shop.placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            submit();
          }
        }}
        className="max-h-[200px] min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground focus-visible:outline-none"
      />
      {voice && (
        <MicButton
          language={language}
          disabled={disabled}
          label={t.shop.speak}
          stopLabel={t.shop.stopListening}
          onHeard={setDraft}
          onFinished={heardEverything}
          onError={onVoiceError}
          onListeningChange={setListening}
        />
      )}
      <Button
        type="submit"
        size="icon"
        aria-label={t.shop.send}
        disabled={disabled || !draft.trim()}
        className="size-9 rounded-full"
      >
        <ArrowUp aria-hidden="true" className="size-[18px]" />
      </Button>
    </form>
  );
}
