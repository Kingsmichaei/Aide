import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../lib/api";
import type { PayPalSessionCallbacks } from "../../lib/paypal";
import { ShopPage } from "./ShopPage";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    sendChat: vi.fn(),
    confirmOrder: vi.fn(),
    createPayPalOrder: vi.fn(),
    approveOrder: vi.fn(),
  };
});

// A fake PayPal SDK: clicking the button runs createOrder, then approves.
let callbacks: PayPalSessionCallbacks | null = null;
vi.mock("../../lib/paypal", () => ({
  loadPayPal: vi.fn(async () => ({
    isPayPalEligible: async () => true,
    createSession: async (cb: PayPalSessionCallbacks) => {
      callbacks = cb;
      return {
        start: async (_: unknown, order: Promise<{ orderId: string }>) => {
          const { orderId } = await order;
          await cb.onApprove({ orderId });
        },
      };
    },
  })),
}));

const kettle: api.Product = {
  id: "k1",
  title: "Blue kettle",
  image_url: null,
  category: "kettles",
  best_offer: {
    price: "29.99",
    currency: "USD",
    retailer: "target.com",
    url: "https://x",
  },
};

const draftOrder: api.Order = {
  id: 7,
  shopper_id: 1,
  status: "draft",
  channel3_product_id: "k1",
  title: "Blue kettle",
  retailer: "target.com",
  price: "29.99",
  currency: "USD",
  total: "29.99",
  confirmed_total: null,
  confirmed_at: null,
  paypal_order_id: null,
  status_changed_at: "2026-10-27T00:00:00Z",
};

const confirmed: api.Order = { ...draftOrder, confirmed_total: "29.99" };

beforeEach(() => {
  vi.stubEnv("VITE_PAYPAL_CLIENT_ID", "sandbox-client");
  vi.mocked(api.sendChat).mockResolvedValueOnce({
    conversation_id: 1,
    reply: "I found a kettle.",
    products: [kettle],
    draft_order: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  callbacks = null;
});

function conversation() {
  return within(screen.getByRole("list", { name: "Conversation" }));
}

async function searchForKettle() {
  render(<ShopPage />);
  fireEvent.change(screen.getByLabelText("Type your message"), {
    target: { value: "I need a kettle" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => conversation().getByText("I found a kettle."));
}

async function chooseAndConfirm() {
  vi.mocked(api.sendChat).mockResolvedValueOnce({
    conversation_id: 1,
    reply: "It costs $29.99 in total. Do you want to buy it?",
    products: [],
    draft_order: draftOrder,
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose this" }));
  await screen.findByRole("heading", { name: "Check your order" });
}

describe("ShopPage", () => {
  it("sends a message, shows the reply and product cards, and moves focus", async () => {
    await searchForKettle();

    expect(api.sendChat).toHaveBeenCalledWith(1, "I need a kettle");
    const reply = conversation().getByText("I found a kettle.").closest("li");
    expect(reply).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("I found a kettle.");
    const card = screen.getByRole("article", { name: "Blue kettle" });
    expect(within(card).getByText("$29.99")).toBeVisible();
    expect(within(card).getByText("From target.com")).toBeVisible();
  });

  it("choosing a product shows the confirmation panel with the total", async () => {
    await searchForKettle();
    await chooseAndConfirm();

    expect(api.sendChat).toHaveBeenLastCalledWith(
      1,
      "I choose this one: Blue kettle (product id: k1)",
    );
    const panel = screen.getByRole("region", { name: "Check your order" });
    expect(within(panel).getByText("Total")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Check your order" }),
    ).toHaveFocus();
  });

  it("pays with PayPal after 'Yes, buy it' and shows Paid", async () => {
    vi.mocked(api.confirmOrder).mockResolvedValue({
      confirmed: true,
      reason: null,
      order: confirmed,
    });
    vi.mocked(api.createPayPalOrder).mockResolvedValue({
      paypal_order_id: "PP-1",
    });
    vi.mocked(api.approveOrder).mockResolvedValue({
      ...confirmed,
      status: "captured",
    });
    await searchForKettle();
    await chooseAndConfirm();

    fireEvent.click(screen.getByRole("button", { name: "Yes, buy it" }));
    expect(api.confirmOrder).toHaveBeenCalledWith(draftOrder);
    await screen.findByRole("heading", { name: /Pay \$29\.99 with PayPal/ });

    const paypalButton = await waitFor(() => {
      const el = document.querySelector("paypal-button");
      if (!el) throw new Error("PayPal button not rendered yet");
      return el as HTMLElement;
    });
    paypalButton.click();

    expect(await screen.findByRole("heading", { name: "Paid" })).toHaveFocus();
    expect(api.createPayPalOrder).toHaveBeenCalledWith(7);
    expect(api.approveOrder).toHaveBeenCalledWith(7);
    expect(callbacks).not.toBeNull();
  });

  it("shows the caregiver message when the order is over the limit", async () => {
    vi.mocked(api.confirmOrder).mockResolvedValue({
      confirmed: true,
      reason: null,
      order: confirmed,
    });
    vi.mocked(api.createPayPalOrder).mockResolvedValue({
      paypal_order_id: "PP-1",
    });
    vi.mocked(api.approveOrder).mockResolvedValue({
      ...confirmed,
      status: "awaiting_caregiver",
    });
    await searchForKettle();
    await chooseAndConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Yes, buy it" }));

    const button = await waitFor(() => {
      const el = document.querySelector("paypal-button");
      if (!el) throw new Error("not yet");
      return el as HTMLElement;
    });
    button.click();

    expect(
      await screen.findByRole("heading", {
        name: "Sent to your caregiver for approval",
      }),
    ).toBeVisible();
  });

  it("asks again when the price changed", async () => {
    vi.mocked(api.confirmOrder).mockResolvedValue({
      confirmed: false,
      reason: "price_changed",
      order: { ...draftOrder, price: "34.00", total: "34.00" },
    });
    await searchForKettle();
    await chooseAndConfirm();

    fireEvent.click(screen.getByRole("button", { name: "Yes, buy it" }));

    expect(
      await conversation().findByText(
        "The price changed. It is now $34.00. Please check again.",
      ),
    ).toBeVisible();
    const panel = screen.getByRole("region", { name: "Check your order" });
    expect(within(panel).getAllByText("$34.00")).toHaveLength(2);
    expect(api.createPayPalOrder).not.toHaveBeenCalled();
  });

  it("'No, not this one' goes back to the chat without buying", async () => {
    await searchForKettle();
    await chooseAndConfirm();

    fireEvent.click(screen.getByRole("button", { name: "No, not this one" }));

    expect(conversation().getByText(/Nothing was bought/)).toBeVisible();
    expect(screen.getByLabelText("Type your message")).toBeVisible();
    expect(api.confirmOrder).not.toHaveBeenCalled();
  });
});
