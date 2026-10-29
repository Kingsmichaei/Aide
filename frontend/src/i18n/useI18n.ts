import { useSettings } from "../lib/settings-context";
import { MESSAGES, money } from "./index";

/** The user's words and price format, following their language setting. */
export function useI18n() {
  const { language } = useSettings().settings;
  return {
    t: MESSAGES[language],
    language,
    money: (amount: string, currency: string) =>
      money(amount, currency, language),
  };
}
