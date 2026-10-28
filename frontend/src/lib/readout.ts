import type { Language, Product } from "./api";
import { formatMoney } from "./format";
import { SPEECH_LANG } from "./speech";

/** Why an option is worth a look. Built from real data, never made up. */
export type Reason =
  | { kind: "cheapest" }
  | { kind: "sale"; was: string; currency: string }
  | { kind: "store"; retailer: string };

/**
 * The cheapest of several options says so; otherwise a real discount; otherwise
 * the store. `options` is every card shown with the same reply.
 */
export function reasonFor(product: Product, options: Product[]): Reason {
  const offer = product.best_offer;
  if (!offer) return { kind: "store", retailer: "" };

  const prices = options
    .map((option) => option.best_offer)
    .filter((other) => other?.currency === offer.currency)
    .map((other) => Number(other?.price));
  const price = Number(offer.price);
  const cheapest =
    prices.length > 1 &&
    prices.every((other) => price <= other) &&
    prices.filter((other) => other === price).length === 1;
  if (cheapest) return { kind: "cheapest" };

  if (offer.compare_at_price) {
    return {
      kind: "sale",
      was: offer.compare_at_price,
      currency: offer.currency,
    };
  }
  return { kind: "store", retailer: offer.retailer };
}

// Moves into src/i18n with the other UI strings in step 5.
const TEXT: Record<
  Language,
  {
    option: (n: number, title: string, price: string) => string;
    reason: (reason: Reason, money: (amount: string) => string) => string;
  }
> = {
  en: {
    option: (n, title, price) => `Option ${n}: ${title}, ${price}.`,
    reason: (r, money) =>
      r.kind === "cheapest"
        ? "It is the lowest price here."
        : r.kind === "sale"
          ? `It is on sale. It was ${money(r.was)}.`
          : `It is sold by ${r.retailer}.`,
  },
  es: {
    option: (n, title, price) => `Opción ${n}: ${title}, ${price}.`,
    reason: (r, money) =>
      r.kind === "cheapest"
        ? "Es el precio más bajo."
        : r.kind === "sale"
          ? `Está rebajado. Antes costaba ${money(r.was)}.`
          : `Lo vende ${r.retailer}.`,
  },
  fr: {
    option: (n, title, price) => `Option ${n} : ${title}, ${price}.`,
    reason: (r, money) =>
      r.kind === "cheapest"
        ? "C'est le prix le plus bas."
        : r.kind === "sale"
          ? `Il est en promotion. Avant, il coûtait ${money(r.was)}.`
          : `Il est vendu par ${r.retailer}.`,
  },
  ar: {
    option: (n, title, price) => `الخيار ${n}: ${title}، ${price}.`,
    reason: (r, money) =>
      r.kind === "cheapest"
        ? "إنه أقل سعر هنا."
        : r.kind === "sale"
          ? `عليه تخفيض. كان سعره ${money(r.was)}.`
          : `يبيعه ${r.retailer}.`,
  },
};

/** One short sentence for a product card: number, name, price, one reason. */
export function optionSentence(
  product: Product,
  index: number,
  options: Product[],
  language: Language,
): string {
  const offer = product.best_offer;
  if (!offer) return "";
  const text = TEXT[language];
  const money = (amount: string) =>
    formatMoney(amount, offer.currency, SPEECH_LANG[language]);
  return `${text.option(index + 1, product.title, money(offer.price))} ${text.reason(
    reasonFor(product, options),
    money,
  )}`;
}

/** What Aide says for a reply: the reply, then one sentence per card. */
export function replyChunks(
  text: string,
  products: Product[],
  language: Language,
): string[] {
  const shown = products.filter((product) => product.best_offer);
  return [
    text,
    ...shown.map((product, index) =>
      optionSentence(product, index, shown, language),
    ),
  ];
}
