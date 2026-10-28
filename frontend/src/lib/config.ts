// Read at call time so tests can stub env values.

export function paypalClientId(): string | undefined {
  return import.meta.env.VITE_PAYPAL_CLIENT_ID || undefined;
}
