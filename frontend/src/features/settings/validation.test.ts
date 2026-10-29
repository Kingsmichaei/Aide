import { describe, expect, it } from "vitest";

import { checkEmail, checkMoney } from "./validation";

describe("checkMoney", () => {
  it("allows an empty amount, which turns the rule off", () => {
    expect(checkMoney("")).toBeNull();
    expect(checkMoney("   ")).toBeNull();
  });

  it("accepts whole amounts and up to two decimals", () => {
    expect(checkMoney("150")).toBeNull();
    expect(checkMoney(" 149.99 ")).toBeNull();
    expect(checkMoney("0.5")).toBeNull();
  });

  it("rejects text, extra decimals and negatives", () => {
    expect(checkMoney("abc")).toBe("invalid");
    expect(checkMoney("1.999")).toBe("invalid");
    expect(checkMoney("-5")).toBe("invalid");
    expect(checkMoney("1,50")).toBe("invalid");
  });

  it("asks for more than zero", () => {
    expect(checkMoney("0")).toBe("positive");
    expect(checkMoney("0.00")).toBe("positive");
  });
});

describe("checkEmail", () => {
  it("allows an empty email and a normal address", () => {
    expect(checkEmail("")).toBe(true);
    expect(checkEmail("maya@example.com")).toBe(true);
  });

  it("rejects something that is not an address", () => {
    expect(checkEmail("maya")).toBe(false);
    expect(checkEmail("maya@example")).toBe(false);
    expect(checkEmail("ma ya@example.com")).toBe(false);
  });
});
