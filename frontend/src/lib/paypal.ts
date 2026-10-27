// PayPal JS SDK v6, sandbox. Docs: https://developer.paypal.com/checkout/integrate
// The SDK only collects the shopper's approval. Authorize and capture happen on our server.

const SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";

export interface PayPalSessionCallbacks {
  onApprove: (data: { orderId: string }) => Promise<void>;
  onCancel: () => void;
  onError: (error: unknown) => void;
}

export interface PayPalSession {
  start(
    options: { presentationMode: "auto" },
    order: Promise<{ orderId: string }>,
  ): Promise<void>;
}

export interface PayPalSdk {
  isPayPalEligible(): Promise<boolean>;
  createSession(callbacks: PayPalSessionCallbacks): Promise<PayPalSession>;
}

interface PayPalInstance {
  findEligibleMethods(): Promise<{ isEligible(method: string): boolean }>;
  createPayPalOneTimePaymentSession(
    callbacks: PayPalSessionCallbacks,
  ): Promise<PayPalSession>;
}

declare global {
  interface Window {
    paypal?: {
      createInstance(options: {
        clientId: string;
        components: string[];
      }): Promise<PayPalInstance>;
    };
  }
}

let loading: Promise<PayPalSdk> | null = null;

export function loadPayPal(clientId: string): Promise<PayPalSdk> {
  loading ??= injectScript().then(async () => {
    if (!window.paypal) throw new Error("PayPal did not load");
    const instance = await window.paypal.createInstance({
      clientId,
      components: ["paypal-payments"],
    });
    return {
      isPayPalEligible: async () =>
        (await instance.findEligibleMethods()).isEligible("paypal"),
      createSession: (callbacks) =>
        instance.createPayPalOneTimePaymentSession(callbacks),
    };
  });
  loading.catch(() => {
    loading = null; // allow a retry
  });
  return loading;
}

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PayPal did not load"));
    document.head.append(script);
  });
}
