import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../lib/api";
import { ApprovalQueue } from "./ApprovalQueue";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return { ...actual, getApprovals: vi.fn(), decideApproval: vi.fn() };
});

const waiting: api.WaitingOrder = {
  order_id: 7,
  shopper: { id: 1, name: "Rosa", language: "es" },
  title: "Vitamin D, 120 tablets",
  retailer: "cvs.com",
  price: "150.00",
  total: "150.00",
  currency: "USD",
  confirmation_method: "voice",
  confirmation_transcript: "Sí, cómpralo",
  waiting_since: "2026-10-28T09:30:00Z",
  summary: "Rosa asked for cheaper vitamins; this is $4 less than last month.",
};

const paidOrder = { id: 7, status: "captured" } as api.Order;

beforeEach(() => {
  vi.mocked(api.getApprovals).mockResolvedValue([waiting]);
});

afterEach(() => {
  vi.resetAllMocks();
});

async function card() {
  render(<ApprovalQueue />);
  return screen.findByRole("article", { name: "Vitamin D, 120 tablets" });
}

describe("ApprovalQueue", () => {
  it("shows what the caregiver needs to decide", async () => {
    const item = await card();

    expect(
      screen.getByRole("heading", { name: "Waiting for you (1)" }),
    ).toBeVisible();
    expect(within(item).getByText(waiting.summary)).toBeVisible();
    expect(within(item).getByText("$150.00")).toBeVisible();
    expect(within(item).getByText("cvs.com")).toBeVisible();
    // The shopper's own words, marked with their language.
    const quote = within(item).getByText("Sí, cómpralo");
    expect(quote.tagName).toBe("Q");
    expect(quote).toHaveAttribute("lang", "es");
  });

  it("shows when the shopper pressed the button instead of speaking", async () => {
    vi.mocked(api.getApprovals).mockResolvedValue([
      {
        ...waiting,
        confirmation_method: "button",
        confirmation_transcript: null,
      },
    ]);
    const item = await card();

    expect(within(item).getByText("Pressed “Yes, buy it”")).toBeVisible();
  });

  it("approves with a note and says what happened", async () => {
    vi.mocked(api.decideApproval).mockResolvedValue({
      outcome: "captured",
      message: "Approved. Rosa's order for Vitamin D, 120 tablets is paid.",
      order: paidOrder,
    });
    const item = await card();

    fireEvent.change(within(item).getByLabelText("Note for Rosa (optional)"), {
      target: { value: "  Fine this time " },
    });
    fireEvent.click(
      within(item).getByRole("button", { name: "Approve and pay $150.00" }),
    );

    expect(
      await screen.findByText(
        "Approved. Rosa's order for Vitamin D, 120 tablets is paid.",
      ),
    ).toBeVisible();
    expect(api.decideApproval).toHaveBeenCalledWith(
      7,
      "approve",
      "Fine this time",
    );
    expect(screen.getByText("Nothing is waiting for you.")).toBeVisible();
  });

  it("declines", async () => {
    vi.mocked(api.decideApproval).mockResolvedValue({
      outcome: "voided",
      message: "Declined. Nothing was paid, and Rosa will be told kindly.",
      order: { ...paidOrder, status: "voided" },
    });
    const item = await card();

    fireEvent.click(within(item).getByRole("button", { name: "Decline" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Declined. Nothing was paid",
    );
    expect(api.decideApproval).toHaveBeenCalledWith(7, "decline", "");
  });

  it("explains an expired payment hold in plain words", async () => {
    vi.mocked(api.decideApproval).mockResolvedValue({
      outcome: "expired",
      message:
        "The payment hold for Vitamin D, 120 tablets ran out before you approved it, so nothing was paid.",
      order: { ...paidOrder, status: "awaiting_shopper" },
    });
    const item = await card();

    fireEvent.click(within(item).getByRole("button", { name: /Approve/ }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "ran out before you approved it",
    );
  });

  it("handles an order someone already decided", async () => {
    vi.mocked(api.decideApproval).mockRejectedValue(
      new api.ApiError(409, "This order is no longer waiting for you."),
    );
    const item = await card();
    vi.mocked(api.getApprovals).mockResolvedValue([]);

    fireEvent.click(within(item).getByRole("button", { name: /Approve/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This order was already handled. Nothing was changed.",
    );
    expect(
      await screen.findByText("Nothing is waiting for you."),
    ).toBeVisible();
  });

  it("keeps the order when PayPal does not answer", async () => {
    vi.mocked(api.decideApproval).mockRejectedValue(
      new api.ApiError(
        502,
        "PayPal did not answer. Nothing was changed; please try again.",
      ),
    );
    const item = await card();

    fireEvent.click(within(item).getByRole("button", { name: /Approve/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "PayPal did not answer",
    );
    expect(
      screen.getByRole("article", { name: "Vitamin D, 120 tablets" }),
    ).toBeVisible();
  });
});
