import type { AppNotification } from "../../lib/api";
import { formatMoney } from "../../lib/format";

/** A caregiver alert in plain words. */
export function describe(notification: AppNotification): string {
  const { shopper_name, title, total, currency } = notification.params;
  const amount =
    total && currency ? ` (${formatMoney(total, currency, "en-US")})` : "";
  switch (notification.kind) {
    case "approval_needed":
      return `${shopper_name ?? "Someone you look after"} needs your approval for ${title ?? "an order"}${amount}.`;
    default:
      return `Update on ${title ?? "an order"}${amount}.`;
  }
}
