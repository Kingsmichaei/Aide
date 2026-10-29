import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MESSAGES } from "@/i18n";
import {
  confirmOrder,
  draftOrder,
  sendChat,
  type ChatResponse,
  type Order,
  type Product,
} from "@/lib/api";
import { renderWithApp } from "@/test/render";

import { ShopPage } from "./ShopPage";

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  sendChat: vi.fn(),
  draftOrder: vi.fn(),
  confirmOrder: vi.fn(),
}));

vi.mock("@/lib/speech", async (original) => ({
  ...(await original<typeof import("@/lib/speech")>()),
  canListen: () => false,
  canSpeak: () => false,
}));

// PayPal's real button loads a script; here it just approves.
vi.mock("./components/PayPalButton", () => ({
  PayPalButton: ({
    order,
    onPaid,
  }: {
    order: Order;
    onPaid: (paid: Order) => void;
  }) => (
    <button
      type="button"
      onClick={() => onPaid({ ...order, status: "captured" })}
    >
      Approve in PayPal
    </button>
  ),
}));

const t = MESSAGES.en;
const [firstPrompt, secondPrompt] = t.shop.suggestions as [string, string];

const headphones: Product = {
  id: "p1",
  title: "Sony WH-1000XM5",
  image_url: null,
  category: "headphones",
  best_offer: {
    price: "179.00",
    compare_at_price: "249.00",
    currency: "USD",
    retailer: "bestbuy.com",
    url: "https://example.com",
  },
};

const draft: Order = {
  id: 7,
  user_id: 1,
  status: "draft",
  channel3_product_id: "p1",
  title: "Sony WH-1000XM5",
  retailer: "bestbuy.com",
  price: "179.00",
  currency: "USD",
  total: "184.99",
  confirmed_total: null,
  confirmed_at: null,
  confirmation_method: null,
  paypal_order_id: null,
  status_changed_at: "2026-10-29T10:00:00Z",
};

function reply(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    conversation_id: 1,
    reply: "Here are my picks.",
    products: [headphones],
    draft_order: null,
    reply_language: null,
    ...overrides,
  };
}

/** Aide's reply is in the conversation and announced to screen readers. */
async function replied() {
  const conversation = await screen.findByRole("list", {
    name: t.shop.conversation,
  });
  expect(
    await within(conversation).findByText("Here are my picks."),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Here are my picks.");
}

beforeEach(() => {
  vi.mocked(sendChat).mockReset();
  vi.mocked(draftOrder).mockReset();
  vi.mocked(confirmOrder).mockReset();
});

describe("ShopPage", () => {
  it("greets the user by first name and offers prompts", () => {
    renderWithApp(<ShopPage />);
    expect(
      screen.getByRole("heading", { name: t.shop.greeting("Maya") }),
    ).toBeInTheDocument();
    for (const prompt of t.shop.suggestions) {
      expect(screen.getByRole("button", { name: prompt })).toBeInTheDocument();
    }
  });

  it("sends a suggested prompt and shows the products", async () => {
    vi.mocked(sendChat).mockResolvedValue(reply());
    renderWithApp(<ShopPage />);

    fireEvent.click(screen.getByRole("button", { name: firstPrompt }));

    await replied();
    expect(vi.mocked(sendChat).mock.calls[0]?.[0]).toBe(firstPrompt);
    expect(screen.getByText(firstPrompt)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: t.card.buyLabel(headphones.title) }),
    ).toBeInTheDocument();
  });

  it("sends a typed message", async () => {
    vi.mocked(sendChat).mockResolvedValue(reply({ products: [] }));
    renderWithApp(<ShopPage />);

    const box = screen.getByRole("textbox", { name: t.shop.composerLabel });
    fireEvent.change(box, { target: { value: "a kettle" } });
    fireEvent.click(screen.getByRole("button", { name: t.shop.send }));

    await replied();
    expect(vi.mocked(sendChat).mock.calls[0]?.[0]).toBe("a kettle");
  });

  it("says when Aide could not answer, and tries again", async () => {
    vi.mocked(sendChat)
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(reply({ products: [] }));
    renderWithApp(<ShopPage />);

    fireEvent.click(screen.getByRole("button", { name: secondPrompt }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t.shop.answerFailed);

    fireEvent.click(within(alert).getByRole("button", { name: t.shop.retry }));

    await replied();
    expect(sendChat).toHaveBeenCalledTimes(2);
    // The message is shown once, not once per try.
    expect(screen.getAllByText(secondPrompt)).toHaveLength(1);
  });

  it("buys with a warning, an extra yes and PayPal", async () => {
    vi.mocked(sendChat).mockResolvedValue(reply());
    vi.mocked(draftOrder).mockResolvedValue(draft);
    vi.mocked(confirmOrder)
      .mockResolvedValueOnce({
        confirmed: false,
        reason: "needs_extra_confirmation",
        warnings: [
          {
            code: "ask_above",
            message: "This is over your ask-first amount of $150.00.",
            amount: "150.00",
            currency: "USD",
          },
        ],
        order: draft,
      })
      .mockResolvedValueOnce({
        confirmed: true,
        reason: null,
        warnings: [],
        order: { ...draft, status: "confirmed", confirmed_total: "184.99" },
      });
    renderWithApp(<ShopPage />);

    fireEvent.click(screen.getByRole("button", { name: firstPrompt }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: t.card.buyLabel(headphones.title),
      }),
    );

    // The full price, delivery included, is shown before buying.
    const sheet = await screen.findByRole("dialog", { name: t.checkout.title });
    expect(within(sheet).getByText("$5.99")).toBeInTheDocument();
    fireEvent.click(
      within(sheet).getByRole("button", { name: t.checkout.buy("$184.99") }),
    );

    expect(
      await within(sheet).findByText(t.checkout.askAbove("$150.00")),
    ).toBeInTheDocument();
    expect(confirmOrder).toHaveBeenLastCalledWith(draft, {
      transcript: undefined,
      acknowledged: [],
    });

    fireEvent.click(
      within(sheet).getByRole("button", {
        name: t.checkout.buyAnyway("$184.99"),
      }),
    );
    await waitFor(() =>
      expect(confirmOrder).toHaveBeenLastCalledWith(draft, {
        transcript: undefined,
        acknowledged: ["ask_above"],
      }),
    );

    fireEvent.click(
      await within(sheet).findByRole("button", { name: "Approve in PayPal" }),
    );

    expect(
      await screen.findByRole("heading", { name: t.success.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: t.success.viewOrders }),
    ).toHaveAttribute("href", "/orders");
  });

  it("tells the user when the price changed and asks again", async () => {
    vi.mocked(sendChat).mockResolvedValue(reply({ draft_order: draft }));
    vi.mocked(confirmOrder).mockResolvedValue({
      confirmed: false,
      reason: "price_changed",
      warnings: [],
      order: { ...draft, price: "189.00", total: "194.99" },
    });
    renderWithApp(<ShopPage />);

    fireEvent.click(screen.getByRole("button", { name: firstPrompt }));
    const sheet = await screen.findByRole("dialog", { name: t.checkout.title });
    fireEvent.click(
      within(sheet).getByRole("button", { name: t.checkout.buy("$184.99") }),
    );

    expect(
      await within(sheet).findByText(t.checkout.priceChanged("$194.99")),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: t.checkout.buy("$194.99") }),
    ).toBeInTheDocument();
  });

  it("opens no checkout when the order cannot be drafted", async () => {
    vi.mocked(sendChat).mockResolvedValue(reply());
    vi.mocked(draftOrder).mockRejectedValue(new Error("gone"));
    renderWithApp(<ShopPage />);

    fireEvent.click(screen.getByRole("button", { name: firstPrompt }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: t.card.buyLabel(headphones.title),
      }),
    );

    await waitFor(() => expect(draftOrder).toHaveBeenCalled());
    expect(draftOrder).toHaveBeenCalledWith("p1", expect.anything());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
