import type { Language } from "./api";

export const SPEECH_LANG: Record<Language, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  ar: "ar-SA",
};

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

/** Speak `text` aloud, cancelling anything already being spoken. */
export function speak(
  text: string,
  language: Language,
  { rate = 1, onEnd }: SpeakOptions = {},
): void {
  if (!canSpeak()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = SPEECH_LANG[language];
  utterance.rate = rate;
  const voice = pickVoice(window.speechSynthesis.getVoices(), language);
  if (voice) utterance.voice = voice;
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

// --- Messages -------------------------------------------------------------

// Shown and spoken. Moves into src/i18n with the other UI strings in step 5.
const MESSAGES: Record<
  Language,
  Record<ListenError | "unsupported", string>
> = {
  en: {
    unsupported: "Talking is not available in this browser. You can type.",
    "not-allowed":
      "I can't use the microphone. Please allow it in your browser, or type instead.",
    "no-speech": "I didn't hear anything. Press Talk to Aide and try again.",
    "no-mic": "I can't find a microphone. You can type instead.",
    network: "I can't hear you right now. Please type instead.",
    unknown: "Something went wrong with the microphone. You can type instead.",
  },
  es: {
    unsupported: "No se puede hablar en este navegador. Puede escribir.",
    "not-allowed":
      "No puedo usar el micrófono. Permítalo en su navegador o escriba.",
    "no-speech": "No oí nada. Pulse Hablar con Aide e inténtelo otra vez.",
    "no-mic": "No encuentro un micrófono. Puede escribir.",
    network: "Ahora no puedo oírle. Por favor, escriba.",
    unknown: "Algo falló con el micrófono. Puede escribir.",
  },
  fr: {
    unsupported:
      "La parole n'est pas disponible dans ce navigateur. Vous pouvez écrire.",
    "not-allowed":
      "Je ne peux pas utiliser le micro. Autorisez-le dans votre navigateur, ou écrivez.",
    "no-speech":
      "Je n'ai rien entendu. Appuyez sur Parler à Aide et réessayez.",
    "no-mic": "Je ne trouve pas de micro. Vous pouvez écrire.",
    network:
      "Je ne peux pas vous entendre pour le moment. Écrivez, s'il vous plaît.",
    unknown: "Un problème est survenu avec le micro. Vous pouvez écrire.",
  },
  ar: {
    unsupported: "التحدث غير متاح في هذا المتصفح. يمكنك الكتابة.",
    "not-allowed":
      "لا أستطيع استخدام الميكروفون. اسمح به في المتصفح، أو اكتب بدلاً من ذلك.",
    "no-speech": "لم أسمع شيئاً. اضغط على تحدث مع Aide وحاول مرة أخرى.",
    "no-mic": "لا أجد ميكروفوناً. يمكنك الكتابة.",
    network: "لا أستطيع سماعك الآن. من فضلك اكتب.",
    unknown: "حدثت مشكلة في الميكروفون. يمكنك الكتابة.",
  },
};

/** A short, plain message to show and speak when talking doesn't work. */
export function speechMessage(
  error: ListenError | "unsupported",
  language: Language,
): string {
  return MESSAGES[language][error];
}
