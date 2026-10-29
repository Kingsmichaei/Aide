import { MESSAGES, money } from "@/i18n";
import type { Language, Order, Product } from "./api";

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

/** One short sentence for a product card: number, name, price, one reason. */
export function optionSentence(
  product: Product,
  index: number,
  options: Product[],
  language: Language,
): string {
  const offer = product.best_offer;
  if (!offer) return "";
  const t = MESSAGES[language].readout;
  const price = (amount: string) => money(amount, offer.currency, language);
  const reason = reasonFor(product, options);
  const why =
    reason.kind === "cheapest"
      ? t.lowest
      : reason.kind === "sale"
        ? t.sale(price(reason.was))
        : t.store(reason.retailer);
  return `${t.option(index + 1, product.title, price(offer.price))} ${why}`;
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

/**
 * Before asking to buy: item, store and full total, then the question. The
 * panel shows exactly these words and Aide says exactly these words, built from
 * the same order the server will be sent when the user says yes.
 */
export function readBack(order: Order, language: Language): [string, string] {
  const t = MESSAGES[language].checkout;
  return [
    t.readBack(
      order.title,
      order.retailer,
      money(order.total, order.currency, language),
    ),
    t.ask,
  ];
}
