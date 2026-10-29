import { describe, expect, it } from "vitest";

import type { Language } from "../lib/api";
import { direction, LANGUAGE_NAMES, MESSAGES, money } from "./index";

const LANGUAGES = Object.keys(MESSAGES) as Language[];

/** Every leaf as text: strings as they are, functions called with sample arguments. */
function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") {
    return [
      [path, String((value as (...args: unknown[]) => unknown)(1, "X", "Y"))],
    ];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, v]) =>
    leaves(v, path ? `${path}.${key}` : key),
  );
}

describe("translations", () => {
  it("cover en, es, fr and ar", () => {
    expect(LANGUAGES).toEqual(["en", "es", "fr", "ar"]);
  });

  it.each(LANGUAGES)("%s has every key, none empty", (language) => {
    const expected = leaves(MESSAGES.en).map(([path]) => path);
    const actual = leaves(MESSAGES[language]);

    expect(actual.map(([path]) => path)).toEqual(expected);
    for (const [path, text] of actual) {
      expect(text.trim(), path).not.toBe("");
    }
  });

  it.each(LANGUAGES.filter((l) => l !== "en"))(
    "%s is actually translated",
    (language) => {
      const english = new Map(leaves(MESSAGES.en));
      const same = leaves(MESSAGES[language]).filter(
        ([path, text]) =>
          english.get(path) === text &&
          // Brand names and plain numbers are the same everywhere.
          ![
            "shop.heading",
            "shop.aide",
            "shop.conversation",
            "settings.normal",
            "checkout.total",
          ].includes(path),
      );
      expect(same).toEqual([]);
    },
  );

  it("fills in the values it is given", () => {
    expect(MESSAGES.es.checkout.priceChanged("10,00 US$")).toContain(
      "10,00 US$",
    );
    expect(MESSAGES.ar.card.from("target.com")).toContain("target.com");
  });

  it("every speech error tells the shopper they can type", () => {
    const typeWords: Record<Language, RegExp> = {
      en: /type/,
      es: /escrib/,
      fr: /écri/i,
      ar: /اكتب|الكتابة/,
    };
    for (const language of LANGUAGES) {
      // "no-speech" asks them to try again instead.
      const messages = Object.entries(MESSAGES[language].speech).filter(
        ([error]) => error !== "no-speech",
      );
      for (const [, text] of messages) {
        expect(text).toMatch(typeWords[language]);
      }
    }
  });
});

describe("helpers", () => {
  it("only Arabic is right-to-left", () => {
    expect(LANGUAGES.map(direction)).toEqual(["ltr", "ltr", "ltr", "rtl"]);
  });

  it("names each language in itself", () => {
    expect(LANGUAGE_NAMES).toEqual({
      en: "English",
      es: "Español",
      fr: "Français",
      ar: "العربية",
    });
  });

  it("formats prices for the shopper's language and the order's currency", () => {
    expect(money("1234.5", "USD", "en")).toBe("$1,234.50");
    expect(money("12345.5", "EUR", "es")).toMatch(/^12\.345,50\s€$/);
    expect(money("1234.5", "EUR", "fr")).toMatch(/^1\s234,50\s€$/);
    expect(money("12", "USD", "ar")).toMatch(/US\$|\$/);
    expect(money("1000", "JPY", "en")).toBe("¥1,000");
  });
});
