import { Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/useI18n";
import {
  ApiError,
  approveOrder,
  createPayPalOrder,
  type Order,
} from "@/lib/api";
import { paypalClientId } from "@/lib/config";
import { loadPayPal } from "@/lib/paypal";

interface Props {
  order: Order;
  onPaid: (order: Order) => void;
  /** The server refused to start payment because something changed. */
  onRecheck: (order: Order, reason: string) => void;
  onError: (message: string) => void;
}

/**
 * PayPal's own button (JS SDK v6, sandbox). PayPal only collects the user's
 * approval; authorize and capture happen on our server (CLAUDE.md rule 1).
 */
export function PayPalButton({ order, onPaid, onRecheck, onError }: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  // Latest callbacks and words, without re-running the SDK setup.
  const latest = useRef({ onPaid, onRecheck, onError, t });
  useEffect(() => {
    latest.current = { onPaid, onRecheck, onError, t };
  });

  useEffect(() => {
    const clientId = paypalClientId();
    const container = containerRef.current;
    if (!clientId || !container) {
      setState("unavailable");
      return;
    }
    let cancelled = false;
    let button: HTMLElement | null = null;

    async function createOrder(): Promise<{ orderId: string }> {
      try {
        const { paypal_order_id } = await createPayPalOrder(order.id);
        return { orderId: paypal_order_id };
      } catch (error) {
        const detail = error instanceof ApiError ? error.detail : null;
        if (detail && typeof detail === "object" && "order" in detail) {
          const { order: changed, reason } = detail as {
            order: Order;
            reason?: string;
          };
          latest.current.onRecheck(changed, reason ?? "details_changed");
        }
        throw error;
      }
    }

    async function setUp() {
      try {
        const sdk = await loadPayPal(clientId as string);
        if (cancelled) return;
        if (!(await sdk.isPayPalEligible())) {
          setState("unavailable");
          return;
        }
        const session = await sdk.createSession({
          onApprove: async () => {
            try {
              latest.current.onPaid(await approveOrder(order.id));
            } catch {
              latest.current.onError(latest.current.t.checkout.finishFailed);
            }
          },
          onCancel: () =>
            latest.current.onError(latest.current.t.checkout.closed),
          onError: () =>
            latest.current.onError(latest.current.t.checkout.problem),
        });
        if (cancelled) return;
        button = document.createElement("paypal-button");
        button.addEventListener("click", () => {
          // Start inside the click so the browser allows the PayPal window.
          session
            .start({ presentationMode: "auto" }, createOrder())
            .catch(() => {});
        });
        container?.append(button);
        setState("ready");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    }

    void setUp();
    return () => {
      cancelled = true;
      button?.remove();
    };
  }, [order.id]);

  return (
    <div className="space-y-3">
      {state === "loading" && (
        <Skeleton
          aria-label={t.checkout.loadingPaypal}
          className="h-11 w-full rounded-full"
        />
      )}
      {state === "unavailable" && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t.checkout.paypalUnavailable}
        </p>
      )}
      <div
        ref={containerRef}
        className="[&>paypal-button]:block [&>paypal-button]:w-full"
      />
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock aria-hidden="true" className="size-3.5" />
        {t.checkout.payHint}
      </p>
    </div>
  );
}
