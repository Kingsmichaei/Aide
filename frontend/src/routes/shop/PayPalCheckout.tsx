import { useEffect, useRef, useState } from "react";

import {
  ApiError,
  approveOrder,
  createPayPalOrder,
  type Order,
} from "../../lib/api";
import { paypalClientId } from "../../lib/config";
import { formatMoney } from "../../lib/format";
import { loadPayPal } from "../../lib/paypal";

interface Props {
  order: Order;
  onDone: (order: Order) => void;
  /** The server refused to create the PayPal order because the price changed. */
  onRecheck: (order: Order) => void;
  onError: (message: string) => void;
}

type SdkState = "loading" | "ready" | "unavailable";

export function PayPalCheckout({ order, onDone, onRecheck, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [sdkState, setSdkState] = useState<SdkState>("loading");
  // Latest callbacks without re-running the SDK setup.
  const handlers = useRef({ onDone, onRecheck, onError });
  useEffect(() => {
    handlers.current = { onDone, onRecheck, onError };
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const clientId = paypalClientId();
    const container = containerRef.current;
    if (!clientId || !container) {
      setSdkState("unavailable");
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
          handlers.current.onRecheck((detail as { order: Order }).order);
        }
        throw error;
      }
    }

    async function setUp() {
      try {
        const sdk = await loadPayPal(clientId as string);
        if (cancelled) return;
        if (!(await sdk.isPayPalEligible())) {
          setSdkState("unavailable");
          return;
        }
        const session = await sdk.createSession({
          onApprove: async () => {
            try {
              handlers.current.onDone(await approveOrder(order.id));
            } catch {
              handlers.current.onError(
                "PayPal approved, but we could not finish. Please try again.",
              );
            }
          },
          onCancel: () =>
            handlers.current.onError("You closed PayPal. Nothing was paid."),
          onError: () =>
            handlers.current.onError("PayPal had a problem. Nothing was paid."),
        });
        if (cancelled) return;
        button = document.createElement("paypal-button");
        button.addEventListener("click", () => {
          // Start the session inside the click so the browser allows the PayPal window.
          session
            .start({ presentationMode: "auto" }, createOrder())
            .catch(() => {});
        });
        container?.append(button);
        setSdkState("ready");
      } catch {
        if (!cancelled) setSdkState("unavailable");
      }
    }

    void setUp();
    return () => {
      cancelled = true;
      button?.remove();
    };
  }, [order.id]);

  return (
    <section
      aria-labelledby="pay-heading"
      className="flex flex-col gap-4 rounded-2xl border-4 border-blue-800 p-6 dark:border-blue-300"
    >
      <h2
        id="pay-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-bold"
      >
        Pay {formatMoney(order.confirmed_total ?? order.total, order.currency)}{" "}
        with PayPal
      </h2>
      <p>
        Press the PayPal button. PayPal will open so you can log in and approve.
      </p>
      {sdkState === "loading" && <p>Loading PayPal…</p>}
      {sdkState === "unavailable" && (
        <p role="alert">PayPal is not available right now. Nothing was paid.</p>
      )}
      <div ref={containerRef} />
    </section>
  );
}
