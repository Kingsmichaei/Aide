import { describe, expect, it } from "vitest";

import type { Product } from "./api";
import { optionSentence, reasonFor, replyChunks } from "./readout";

function product(
  id: string,
  price: string,
  {
    was = null,
    currency = "USD",
  }: { was?: string | null; currency?: string } = {},
): Product {
  return {
    id,
    title: `Kettle ${id}`,
    image_url: null,
    category: "kettles",
    best_offer: {
      price,
      compare_at_price: was,
      currency,
      retailer: `${id}.com`,
      url: "https://x",
    },
  };
}

describe("reasonFor", () => {
  it("names the cheapest of several options", () => {
    const options = [product("a", "30.00"), product("b", "25.00")];
    expect(reasonFor(options[1] as Product, options)).toEqual({
      kind: "cheapest",
    });
  });

  it("does not call a tie the cheapest", () => {
    const options = [product("a", "25.00"), product("b", "25.00")];
    expect(reasonFor(options[0] as Product, options).kind).toBe("store");
  });

  it("mentions a real discount", () => {
    const options = [
      product("a", "20.00"),
      product("b", "25.00", { was: "40.00" }),
    ];
    expect(reasonFor(options[1] as Product, options)).toEqual({
      kind: "sale",
      was: "40.00",
      currency: "USD",
    });
  });

  it("falls back to the store, including for a single option", () => {
    const only = product("a", "20.00");
    expect(reasonFor(only, [only])).toEqual({
      kind: "store",
      retailer: "a.com",
    });
  });

  it("only compares prices in the same currency", () => {
    const options = [
      product("a", "30.00"),
      product("b", "5.00", { currency: "EUR" }),
    ];
    expect(reasonFor(options[1] as Product, options).kind).toBe("store");
  });
});

describe("optionSentence", () => {
  const options = [product("a", "30.00"), product("b", "25.00")];

  it("says number, name, price and one reason", () => {
    expect(optionSentence(options[1] as Product, 1, options, "en")).toBe(
      "Option 2: Kettle b, $25.00. It is the lowest price here.",
    );
    expect(optionSentence(options[0] as Product, 0, options, "en")).toBe(
      "Option 1: Kettle a, $30.00. It is sold by a.com.",
    );
  });

  it("speaks the shopper's language with local number format", () => {
    // Intl puts a no-break space before the currency, hence \s.
    expect(optionSentence(options[1] as Product, 1, options, "es")).toMatch(
      /^Opción 2: Kettle b, 25,00\sUS\$\. Es el precio más bajo\.$/,
    );
    expect(optionSentence(options[0] as Product, 0, options, "fr")).toMatch(
      /^Choix 1 : Kettle a, 30,00\s\$US\. Il est vendu par a\.com\.$/,
    );
    expect(optionSentence(options[0] as Product, 0, options, "ar")).toMatch(
      /^الخيار 1: Kettle a، .+\. يبيعه a\.com\.$/,
    );
  });
});

describe("sale sentences", () => {
  it("formats the old price in the shopper's language", () => {
    const options = [
      product("a", "20.00"),
      product("b", "25.00", { was: "40.00" }),
    ];
    expect(optionSentence(options[1] as Product, 1, options, "en")).toBe(
      "Option 2: Kettle b, $25.00. It is on sale. It was $40.00.",
    );
    expect(optionSentence(options[1] as Product, 1, options, "es")).toMatch(
      /Antes costaba 40,00\sUS\$\.$/,
    );
  });
});

describe("replyChunks", () => {
  it("is the reply followed by one sentence per card", () => {
    const options = [product("a", "30.00"), product("b", "25.00")];
    expect(replyChunks("I found two.", options, "en")).toEqual([
      "I found two.",
      "Option 1: Kettle a, $30.00. It is sold by a.com.",
      "Option 2: Kettle b, $25.00. It is the lowest price here.",
    ]);
  });

  it("skips products without an offer", () => {
    const noOffer = { ...product("x", "1.00"), best_offer: null };
    expect(replyChunks("Hi.", [noOffer], "en")).toEqual(["Hi."]);
  });
});
