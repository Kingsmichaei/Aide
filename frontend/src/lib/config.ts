// Read at call time so tests can stub env values.

export function paypalClientId(): string | undefined {
  return import.meta.env.VITE_PAYPAL_CLIENT_ID || undefined;
}

/** No sign-in yet (Day 2): the shopper app acts as the seeded demo shopper. */
export function demoShopperId(): number {
  return Number(import.meta.env.VITE_DEMO_SHOPPER_ID ?? "1");
}
