import type { Language } from "../lib/api";
import { formatMoney } from "../lib/format";
import { ar } from "./ar";
import { en, type Messages } from "./en";
import { es } from "./es";
import { fr } from "./fr";

export type { Messages };

export const MESSAGES: Record<Language, Messages> = { en, es, fr, ar };

/** BCP 47 locale per language, for speech and for Intl number formats. */
export const LOCALE: Record<Language, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  ar: "ar-SA",
};

/** Each language named in itself, so a shopper can always find their own. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  ar: "العربية",
};

export function direction(language: Language): "rtl" | "ltr" {
  return language === "ar" ? "rtl" : "ltr";
}

/** A price in the order's currency, written the way the shopper's language writes it. */
export function money(
  amount: string,
  currency: string,
  language: Language,
): string {
  return formatMoney(amount, currency, LOCALE[language]);
}
