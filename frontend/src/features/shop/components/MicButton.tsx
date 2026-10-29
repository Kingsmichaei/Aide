import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Language } from "@/lib/api";
import {
  listen,
  stopSpeaking,
  type ListenError,
  type Listening,
} from "@/lib/speech";
import { cn } from "@/lib/utils";

interface Props {
  language: Language;
  disabled?: boolean;
  /** Visible label for the pill version; the icon version uses it as its name. */
  label: string;
  stopLabel: string;
  variant?: "icon" | "pill";
  /** The transcript so far, as the user speaks. */
  onHeard: (text: string) => void;
  /** Listening has ended and something was heard. */
  onFinished: (text: string) => void;
  onError: (error: ListenError) => void;
  onListeningChange?: (listening: boolean) => void;
}

/**
 * Press once to start listening, press again to stop (no hold-to-talk). Space
 * and Enter work because it is a real button. Callers hide it when
 * `canListen()` is false.
 */
export function MicButton({
  language,
  disabled = false,
  label,
  stopLabel,
  variant = "icon",
  onHeard,
  onFinished,
  onError,
  onListeningChange,
}: Props) {
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

  function changeListening(next: boolean) {
    setListening(next);
    onListeningChange?.(next);
  }

  function start() {
    stopSpeaking(); // Aide stops talking when the user starts.
    heard.current = "";
    const started = listen(language, {
      onTranscript: (text) => {
        heard.current = text;
        onHeard(text);
      },
      onError,
      onEnd: () => {
        session.current = undefined;
        changeListening(false);
        if (heard.current) onFinished(heard.current);
      },
    });
    if (started) {
      session.current = started;
      changeListening(true);
    }
  }

  const name = listening ? stopLabel : label;
  const toggle = () => (session.current ? session.current.stop() : start());
  const Icon = listening ? Square : Mic;

  if (variant === "pill") {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={disabled && !listening}
        onClick={toggle}
        className={cn(
          "gap-2 rounded-full",
          listening && "border-destructive/50 text-destructive",
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn(listening && "motion-safe:animate-pulse")}
        />
        {name}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={name}
          aria-pressed={listening}
          disabled={disabled && !listening}
          onClick={toggle}
          className={cn(
            "relative size-9 rounded-full text-muted-foreground",
            listening &&
              "bg-destructive-soft text-destructive hover:bg-destructive-soft",
          )}
        >
          {listening && (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full ring-2 ring-destructive/40 motion-safe:animate-ping"
            />
          )}
          <Icon aria-hidden="true" className="size-[18px]" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
}
