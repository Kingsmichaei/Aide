// "/api" is the same origin as the app: Vite (dev) and Render (prod) forward it
// to the API, so the HTTP-only session cookie just works.
export const API_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(
  /\/$/,
  "",
);

export type Language = "en" | "es" | "fr" | "ar";
export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export type Theme = "light" | "dark" | "system";

export interface SessionUser {
  id: number;
  name: string;
  email: string | null;
}

/** The signed-in user's profile and preferences (GET/PATCH /me). */
export interface Profile {
  id: number;
  name: string;
  email: string | null;
  language: Language;
  currency: Currency;
  theme: Theme;
  voice_speed: number;
  auto_send: boolean;
  read_aloud: boolean;
}

export type ProfileChanges = Partial<Omit<Profile, "id">>;

export interface Category {
  slug: string;
  title: string;
  /** Titles from the top category down, e.g. ["Health", "Vitamins"]. */
  path: string[];
}

export interface SpendingRules {
  /** Amounts are in this currency (the user's). */
  currency: Currency;
  monthly_budget: string | null;
  ask_above: string | null;
  blocked_categories: Category[];
}

export interface SpendingRulesInput {
  monthly_budget: string | null;
  ask_above: string | null;
  /** Channel3 category slugs. */
  blocked_categories: string[];
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
  | "confirmed"
  | "awaiting_payment"
  | "authorized"
  | "captured"
  | "voided"
  | "refunded"
  | "failed";

export interface Order {
  id: number;
  user_id: number;
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

export interface OrderRow {
  id: number;
  created_at: string;
  title: string;
  retailer: string;
  category: string | null;
  price: string;
  total: string;
  currency: string;
  status: OrderStatus;
  method: "voice" | "button" | null;
}

export interface OrderDetail {
  order: Order;
  confirmation_transcript: string | null;
  events: {
    at: string;
    event: string;
    actor: "user" | "system";
    status: OrderStatus;
    note: string | null;
  }[];
  conversation: { role: "user" | "aide"; text: string }[];
}

export interface ChatResponse {
  conversation_id: number;
  reply: string;
  products: Product[];
  draft_order: Order | null;
  /** The reply's language when it differs from the user's setting. */
  reply_language: Language | null;
}

export type WarningCode = "ask_above" | "over_budget" | "other_currency";

/** A spending rule this purchase would break. Buying still works after an extra yes. */
export interface RuleWarning {
  code: WarningCode;
  /** English; the app words it itself from `code` and `amount`. */
  message: string;
  amount: string | null;
  currency: string;
}

export type ConfirmReason =
  | "details_changed"
  | "price_changed"
  | "retailer_changed"
  | "unavailable"
  // The purchase breaks a spending rule: ask once more, showing `warnings`.
  | "needs_extra_confirmation"
  // Voice only: the server did not hear an explicit yes.
  | "declined"
  | "unclear";

export interface ConfirmResponse {
  confirmed: boolean;
  reason: ConfirmReason | null;
  warnings: RuleWarning[];
  order: Order;
}

export interface ChartPoint {
  label: string;
  total: string;
}

export interface Spending {
  currency: string;
  spent_this_month: string;
  orders_this_month: number;
  monthly_budget: string | null;
  budget_left: string | null;
  ask_above: string | null;
  /** Labels like "2026-10", oldest first. */
  by_month: ChartPoint[];
  by_category: ChartPoint[];
}

export interface HealthResponse {
  status: string;
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

// --- Sign-in -----------------------------------------------------------------

export function getUsers(): Promise<SessionUser[]> {
  return request("/auth/users");
}

export function signIn(userId: number): Promise<SessionUser> {
  return post("/auth/session", { user_id: userId });
}

export function getSessionUser(): Promise<SessionUser> {
  return request("/auth/me");
}

export function signOut(): Promise<void> {
  return send("DELETE", "/auth/session");
}

// --- Profile and rules -------------------------------------------------------

export function getProfile(): Promise<Profile> {
  return request("/me");
}

export function updateProfile(changes: ProfileChanges): Promise<Profile> {
  return send("PATCH", "/me", changes);
}

export function getRules(): Promise<SpendingRules> {
  return request("/rules");
}

export function saveRules(rules: SpendingRulesInput): Promise<SpendingRules> {
  return send("PUT", "/rules", rules);
}

/** Top-level Channel3 categories, or those matching `query`. */
export function getCategories(query = ""): Promise<Category[]> {
  const search = query ? `?query=${encodeURIComponent(query)}` : "";
  return request(`/rules/categories${search}`);
}

// --- Chat and checkout -------------------------------------------------------

export function sendChat(message: string): Promise<ChatResponse> {
  return post("/chat", { message });
}

/** One tap on Buy: draft an order for the product's best offer. Nothing is paid. */
export function draftOrder(productId: string): Promise<Order> {
  return post("/orders/draft", { channel3_product_id: productId });
}

/**
 * Confirm exactly the order the user was shown. For a spoken answer, pass the
 * transcript: the server decides whether it was a yes. `acknowledged` lists the
 * spending-rule warnings the user saw and accepted.
 */
export function confirmOrder(
  order: Order,
  options: { transcript?: string; acknowledged?: WarningCode[] } = {},
): Promise<ConfirmResponse> {
  const { title, price, currency, total } = order;
  return post(`/orders/${order.id}/confirm`, {
    title,
    price,
    currency,
    total,
    method: options.transcript ? "voice" : "button",
    transcript: options.transcript ?? null,
    acknowledged: options.acknowledged ?? [],
  });
}

export function createPayPalOrder(
  orderId: number,
): Promise<{ paypal_order_id: string }> {
  return post(`/orders/${orderId}/paypal`);
}

/** After PayPal approval: the server authorizes and captures. */
export function approveOrder(orderId: number): Promise<Order> {
  return post(`/orders/${orderId}/approved`);
}

// --- Orders and insights -----------------------------------------------------

export function getOrders(): Promise<OrderRow[]> {
  return request("/orders");
}

export function getOrderDetail(orderId: number): Promise<OrderDetail> {
  return request(`/orders/${orderId}`);
}

export function getSpending(): Promise<Spending> {
  return request("/insights/spending");
}
