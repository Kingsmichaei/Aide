import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../lib/api";
import type { PayPalSessionCallbacks } from "../../lib/paypal";
import { DEFAULT_SETTINGS, SettingsContext } from "../../lib/settings-context";
import { FakeRecognition } from "../../test/fakeSpeech";
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
    await waitFor(() => expect(reply).toHaveFocus());
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
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Check your order" }),
      ).toHaveFocus(),
    );
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

    const paid = await screen.findByRole("heading", { name: "Paid" });
    await waitFor(() => expect(paid).toHaveFocus());
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

describe("Talk to Aide", () => {
  const speakMock = vi.fn();
  const cancelMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    vi.stubGlobal("speechSynthesis", {
      speak: speakMock,
      cancel: cancelMock,
      getVoices: () => [],
    });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        lang = "";
        rate = 1;
        voice = null;
        constructor(public text: string) {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    FakeRecognition.reset();
  });

  function renderWith(changes: Partial<api.ShopperSettings> = {}) {
    const value = {
      settings: { ...DEFAULT_SETTINGS, ...changes },
      update: async () => {},
    };
    render(
      <SettingsContext value={value}>
        <ShopPage />
      </SettingsContext>,
    );
  }

  function pressTalk() {
    fireEvent.click(screen.getByRole("button", { name: "Talk to Aide" }));
    const recognition = FakeRecognition.last;
    if (!recognition) throw new Error("not listening");
    return recognition;
  }

  it("is hidden where the browser cannot listen, and typing still works", () => {
    vi.unstubAllGlobals();
    renderWith({ language: "es" });

    expect(
      screen.queryByRole("button", { name: "Talk to Aide" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Puede escribir/)).toBeVisible();
    expect(screen.getByLabelText("Type your message")).toBeVisible();
  });

  it("listens in the shopper's language and shows a live transcript", () => {
    renderWith({ language: "es" });

    const recognition = pressTalk();
    act(() => {
      recognition.hear(["necesito una", false]);
    });

    expect(recognition.lang).toBe("es-ES");
    expect(
      screen.getByRole("button", { name: "Stop listening" }),
    ).toBeVisible();
    expect(screen.getByText(/Listening…/)).toBeVisible();
    expect(screen.getByLabelText("Type your message")).toHaveValue(
      "necesito una",
    );
  });

  it("stops Aide talking when the shopper starts", () => {
    renderWith();
    pressTalk();
    expect(cancelMock).toHaveBeenCalled();
  });

  it("sends by itself when the shopper stops speaking (auto-send on)", async () => {
    renderWith();

    const recognition = pressTalk();
    act(() => {
      recognition.hear(["I need a kettle", true]);
    });
    act(() => {
      recognition.end();
    });

    await waitFor(() => conversation().getByText("I found a kettle."));
    expect(api.sendChat).toHaveBeenCalledWith(1, "I need a kettle");
    expect(screen.getByLabelText("Type your message")).toHaveValue("");
  });

  it("leaves the words in the box to fix when auto-send is off", () => {
    renderWith({ auto_send: false });

    const recognition = pressTalk();
    act(() => {
      recognition.hear(["I need a kettel", true]);
    });
    act(() => {
      recognition.end();
    });

    const box = screen.getByLabelText("Type your message");
    expect(box).toHaveValue("I need a kettel");
    expect(box).toHaveFocus();
    expect(api.sendChat).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Talk to Aide" })).toBeVisible();
  });

  it("pressing again stops listening", () => {
    renderWith();

    const recognition = pressTalk();
    fireEvent.click(screen.getByRole("button", { name: "Stop listening" }));

    expect(recognition.stop).toHaveBeenCalled();
  });

  it("shows and speaks a plain message when the mic is blocked", () => {
    renderWith({ voice_speed: 0.8 });

    const recognition = pressTalk();
    act(() => {
      recognition.fail("not-allowed");
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "I can't use the microphone. Please allow it in your browser, or type instead.",
    );
    const [utterance] = speakMock.mock.calls[0] as [SpeechSynthesisUtterance];
    expect(utterance.text).toMatch(/can't use the microphone/);
    expect(utterance.rate).toBe(0.8);
    expect(api.sendChat).not.toHaveBeenCalled();
  });
});
