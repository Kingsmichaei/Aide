import type { Language } from "./api";

export const SPEECH_LANG: Record<Language, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  ar: "ar-SA",
};

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Speak `text` aloud, cancelling anything already being spoken. */
export function speak(text: string, language: Language, rate = 1): void {
  if (!canSpeak()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = SPEECH_LANG[language];
  utterance.rate = rate;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
