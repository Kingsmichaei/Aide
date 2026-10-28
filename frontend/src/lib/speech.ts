import { LOCALE } from "../i18n";
import type { Language } from "./api";

/** Speech uses the same locale as number formats. */
export const SPEECH_LANG: Record<Language, string> = LOCALE;

// --- Speech to text -------------------------------------------------------

// The Web Speech recognition API is not in TypeScript's DOM types, so we
// describe the small part of it we use.
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionResultEvent {
  readonly results: ArrayLike<RecognitionResult>;
}
interface RecognitionErrorEvent {
  readonly error: string;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** False in browsers without speech recognition (for example Firefox). */
export function canListen(): boolean {
  return recognitionConstructor() !== undefined;
}

export type ListenError =
  | "not-allowed" // the shopper or the browser blocked the microphone
  | "no-speech" // the mic was on but nobody spoke
  | "no-mic" // no microphone found
  | "network" // the browser's speech service could not be reached
  | "unknown";

export interface ListenHandlers {
  /** Called as words arrive. `final` is true once the browser is sure. */
  onTranscript: (text: string, final: boolean) => void;
  onError: (error: ListenError) => void;
  /** Called once listening has stopped, for any reason. */
  onEnd: () => void;
}

export interface Listening {
  /** Stop listening and keep what was heard. */
  stop: () => void;
  /** Stop listening and throw away what was heard. */
  cancel: () => void;
}

const ERRORS: Record<string, ListenError> = {
  "not-allowed": "not-allowed",
  "service-not-allowed": "not-allowed",
  "no-speech": "no-speech",
  "audio-capture": "no-mic",
  network: "network",
};

/**
 * Listen for one request in the shopper's language. Listening ends by itself
 * when the shopper stops speaking, or when `stop()` is called.
 */
export function listen(
  language: Language,
  handlers: ListenHandlers,
): Listening | undefined {
  const Recognition = recognitionConstructor();
  if (!Recognition) return undefined;

  const recognition = new Recognition();
  recognition.lang = SPEECH_LANG[language];
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let cancelled = false;
  recognition.onresult = (event) => {
    if (cancelled) return;
    const results = Array.from(event.results);
    const text = results
      .map((result) => result[0]?.transcript ?? "")
      .join("")
      .trim();
    handlers.onTranscript(
      text,
      results.every((result) => result.isFinal),
    );
  };
  recognition.onerror = (event) => {
    // "aborted" is what we get after cancel(); it is not the shopper's problem.
    if (cancelled || event.error === "aborted") return;
    handlers.onError(ERRORS[event.error] ?? "unknown");
  };
  recognition.onend = () => {
    handlers.onEnd();
  };

  try {
    recognition.start();
  } catch {
    // start() throws if the browser is already listening elsewhere.
    handlers.onError("unknown");
    handlers.onEnd();
    return undefined;
  }

  return {
    stop: () => {
      recognition.stop();
    },
    cancel: () => {
      cancelled = true;
      recognition.abort();
    },
  };
}

// --- Text to speech -------------------------------------------------------

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * The best installed voice for a language: an exact match (es-ES), then any
 * voice for the language (es-MX), preferring the browser's default voice.
 * Undefined means the browser picks, guided by the utterance's `lang`.
 */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: Language,
): SpeechSynthesisVoice | undefined {
  const wanted = SPEECH_LANG[language].toLowerCase();
  const normalise = (lang: string) => lang.replace("_", "-").toLowerCase();
  const byDefault = (a: SpeechSynthesisVoice, b: SpeechSynthesisVoice) =>
    Number(b.default) - Number(a.default);

  const exact = voices.filter((voice) => normalise(voice.lang) === wanted);
  if (exact.length > 0) return [...exact].sort(byDefault)[0];

  const sameLanguage = voices.filter(
    (voice) => normalise(voice.lang).split("-")[0] === language,
  );
  return [...sameLanguage].sort(byDefault)[0];
}

export interface SpeakOptions {
  /** voice_speed from the shopper's settings; 1 is normal. */
  rate?: number;
  onEnd?: () => void;
}

/**
 * Speak aloud, cancelling anything already being spoken. Several pieces are
 * queued as separate utterances: Chrome cuts long utterances off after about
 * 15 seconds. `onEnd` runs once, when the last piece ends or speech stops.
 */
export function speak(
  text: string | readonly string[],
  language: Language,
  { rate = 1, onEnd }: SpeakOptions = {},
): void {
  if (!canSpeak()) return;
  const pieces = (typeof text === "string" ? [text] : text).filter(
    (piece) => piece.trim() !== "",
  );
  const voice = pickVoice(window.speechSynthesis.getVoices(), language);
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    onEnd?.();
  };

  window.speechSynthesis.cancel();
  pieces.forEach((piece, index) => {
    const utterance = new SpeechSynthesisUtterance(piece);
    utterance.lang = SPEECH_LANG[language];
    utterance.rate = rate;
    if (voice) utterance.voice = voice;
    utterance.onerror = end;
    if (index === pieces.length - 1) utterance.onend = end;
    window.speechSynthesis.speak(utterance);
  });
  if (pieces.length === 0) end();
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
