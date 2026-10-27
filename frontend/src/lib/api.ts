export const API_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export interface HealthResponse {
  status: string;
}

export interface Offer {
  price: string;
  currency: string;
  retailer: string;
  url: string;
}

export interface Product {
  id: string;
  title: string;
  image_url: string | null;
  category: string | null;
  best_offer: Offer | null;
}

export type OrderStatus =
  | "draft"
  | "awaiting_shopper"
  | "awaiting_caregiver"
  | "captured"
  | "voided"
  | "refunded";

export interface Order {
  id: number;
  shopper_id: number;
  status: OrderStatus;
  channel3_product_id: string;
  title: string;
  retailer: string;
  price: string;
  currency: string;
  total: string;
  confirmed_total: string | null;
  confirmed_at: string | null;
  paypal_order_id: string | null;
  status_changed_at: string;
}

export interface ChatResponse {
  conversation_id: number;
  reply: string;
  products: Product[];
  draft_order: Order | null;
}

export type ConfirmReason =
  "details_changed" | "price_changed" | "retailer_changed" | "unavailable";

export interface ConfirmResponse {
  confirmed: boolean;
  reason: ConfirmReason | null;
  order: Order;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, detail: unknown) {
    super(
      typeof detail === "string"
        ? detail
        : `Request failed with HTTP ${status}`,
    );
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    let detail: unknown = null;
    try {
      detail = ((await response.json()) as { detail?: unknown }).detail ?? null;
    } catch {
      // body was not JSON
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_URL}/health`, { signal });
  if (!response.ok) {
    throw new Error(`Health check failed with HTTP ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}

export function sendChat(
  shopperId: number,
  message: string,
): Promise<ChatResponse> {
  return post("/chat", { shopper_id: shopperId, message });
}

/** Send exactly what the shopper saw; the server refuses if anything changed. */
export function confirmOrder(order: Order): Promise<ConfirmResponse> {
  const { title, price, currency, total } = order;
  return post(`/orders/${order.id}/confirm`, { title, price, currency, total });
}

export function createPayPalOrder(
  orderId: number,
): Promise<{ paypal_order_id: string }> {
  return post(`/orders/${orderId}/paypal`);
}

export function approveOrder(orderId: number): Promise<Order> {
  return post(`/orders/${orderId}/approved`);
}
