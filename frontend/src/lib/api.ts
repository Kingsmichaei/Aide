// "/api" is the same origin as the app: Vite (dev) and Render (prod) forward it
// to the API, so the HTTP-only session cookie just works.
export const API_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(
  /\/$/,
  "",
);

export type Role = "shopper" | "caregiver";

export interface SessionUser {
  id: number;
  name: string;
  role: Role;
}

export interface CaredForShopper {
  id: number;
  name: string;
  language: Language;
}

export interface Category {
  slug: string;
  title: string;
  /** Titles from the top category down, e.g. ["Health", "Vitamins"]. */
  path: string[];
}

export const LIMIT_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type LimitCurrency = (typeof LIMIT_CURRENCIES)[number];

export interface Limits {
  /** False until a caregiver saves limits; until then no order needs approval. */
  is_set: boolean;
  per_order_max: string | null;
  monthly_max: string | null;
  currency: LimitCurrency;
  blocked_categories: Category[];
}

export interface WaitingOrder {
  order_id: number;
  shopper: CaredForShopper;
  title: string;
  retailer: string;
  price: string;
  total: string;
  currency: string;
  confirmation_method: "voice" | "button" | null;
  /** What the shopper said when they confirmed by voice. */
  confirmation_transcript: string | null;
  waiting_since: string;
  /** One sentence written by the AI from the order's facts. */
  summary: string;
}

export type DecisionOutcome = "captured" | "voided" | "expired";

export interface DecisionResult {
  outcome: DecisionOutcome;
  /** Plain words for the caregiver about what happened. */
  message: string;
  order: Order;
}

export interface LimitsInput {
  per_order_max: string;
  monthly_max: string;
  currency: LimitCurrency;
  /** Channel3 category slugs. */
  blocked_categories: string[];
}

export interface HealthResponse {
  status: string;
}

export interface Offer {
  price: string;
  /** The "was" price when the item is on sale. */
  compare_at_price: string | null;
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
  confirmation_method: "voice" | "button" | null;
  paypal_order_id: string | null;
  status_changed_at: string;
}

export type Language = "en" | "es" | "fr" | "ar";

export interface ShopperSettings {
  language: Language;
  voice_speed: number;
  text_size: number;
  auto_send: boolean;
  read_aloud: boolean;
}

export interface ChatResponse {
  conversation_id: number;
  reply: string;
  products: Product[];
  draft_order: Order | null;
  /** The reply's language when it differs from the shopper's setting. */
  reply_language: Language | null;
}

export type ConfirmReason =
  | "details_changed"
  | "price_changed"
  | "retailer_changed"
  | "unavailable"
  // Voice only: the server did not hear an explicit yes.
  | "declined"
  | "unclear";

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
  // "include" also sends the cookie if VITE_API_URL points at another origin.
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!response.ok) {
    let detail: unknown = null;
    try {
      detail = ((await response.json()) as { detail?: unknown }).detail ?? null;
    } catch {
      // body was not JSON
    }
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return send<T>("POST", path, body);
}

function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
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

export function getUsers(): Promise<SessionUser[]> {
  return request("/auth/users");
}

export function signIn(userId: number): Promise<SessionUser> {
  return post("/auth/session", { user_id: userId });
}

export function getMe(): Promise<SessionUser> {
  return request("/auth/me");
}

export function signOut(): Promise<void> {
  return send("DELETE", "/auth/session");
}

export function getCaredForShoppers(): Promise<CaredForShopper[]> {
  return request("/care/shoppers");
}

/** Top-level Channel3 categories, or those matching `query`. */
export function getCategories(query = ""): Promise<Category[]> {
  const search = query ? `?query=${encodeURIComponent(query)}` : "";
  return request(`/care/categories${search}`);
}

export function getApprovals(): Promise<WaitingOrder[]> {
  return request("/care/approvals");
}

export function decideApproval(
  orderId: number,
  decision: "approve" | "decline",
  note: string,
): Promise<DecisionResult> {
  return post(`/care/approvals/${orderId}`, { decision, note: note || null });
}

export function getLimits(shopperId: number): Promise<Limits> {
  return request(`/care/shoppers/${shopperId}/limits`);
}

export function saveLimits(
  shopperId: number,
  limits: LimitsInput,
): Promise<Limits> {
  return send("PUT", `/care/shoppers/${shopperId}/limits`, limits);
}

export function sendChat(
  shopperId: number,
  message: string,
): Promise<ChatResponse> {
  return post("/chat", { shopper_id: shopperId, message });
}

/**
 * Confirm exactly the order the shopper was shown and read. For a spoken
 * answer, pass the transcript: the server decides whether it was a yes.
 */
export function confirmOrder(
  order: Order,
  spoken?: { transcript: string },
): Promise<ConfirmResponse> {
  const { title, price, currency, total } = order;
  return post(`/orders/${order.id}/confirm`, {
    title,
    price,
    currency,
    total,
    method: spoken ? "voice" : "button",
    transcript: spoken?.transcript ?? null,
  });
}

export function createPayPalOrder(
  orderId: number,
): Promise<{ paypal_order_id: string }> {
  return post(`/orders/${orderId}/paypal`);
}

export function approveOrder(orderId: number): Promise<Order> {
  return post(`/orders/${orderId}/approved`);
}

export function getSettings(shopperId: number): Promise<ShopperSettings> {
  return request(`/shoppers/${shopperId}/settings`);
}

export function updateSettings(
  shopperId: number,
  changes: Partial<ShopperSettings>,
): Promise<ShopperSettings> {
  return send("PATCH", `/shoppers/${shopperId}/settings`, changes);
}
