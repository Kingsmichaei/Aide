const MONEY = /^\d+(\.\d{1,2})?$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type MoneyProblem = "invalid" | "positive";

/** An optional amount: empty is fine (the rule is off); otherwise > 0, 2 decimals. */
export function checkMoney(value: string): MoneyProblem | null {
  const text = value.trim();
  if (!text) return null;
  if (!MONEY.test(text)) return "invalid";
  if (Number(text) <= 0) return "positive";
  return null;
}

export function checkEmail(value: string): boolean {
  const text = value.trim();
  return !text || EMAIL.test(text);
}
