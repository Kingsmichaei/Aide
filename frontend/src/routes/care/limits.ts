export interface LimitValues {
  perOrder: string;
  monthly: string;
}

export type LimitErrors = Partial<Record<keyof LimitValues, string>>;

const MONEY = /^\d+(\.\d{1,2})?$/;

/** Same rules as the server: positive amounts, a month covers at least one order. */
export function validateLimits({
  perOrder,
  monthly,
}: LimitValues): LimitErrors {
  const errors: LimitErrors = {};
  const check = (value: string) => {
    const text = value.trim();
    if (!text) return "Enter an amount.";
    if (!MONEY.test(text)) return "Use a number like 50 or 49.99.";
    if (Number(text) <= 0) return "The amount must be more than 0.";
    return undefined;
  };
  const perOrderError = check(perOrder);
  const monthlyError = check(monthly);
  if (perOrderError) errors.perOrder = perOrderError;
  if (monthlyError) errors.monthly = monthlyError;
  if (!perOrderError && !monthlyError && Number(monthly) < Number(perOrder)) {
    errors.monthly = "The monthly limit must be at least the per-order limit.";
  }
  return errors;
}
