export function formatMoney(
  amount: string,
  currency: string,
  locale?: string,
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    Number(amount),
  );
}
