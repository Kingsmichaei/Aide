import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "../../lib/api";
import { OrderPanel } from "./OrderPanel";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return { ...actual, getOrderDetail: vi.fn() };
});

const rosa: api.CaredForShopper = { id: 1, name: "Rosa", language: "es" };

const row: api.LedgerRow = {
  id: 7,
  created_at: "2026-10-27T10:00:00Z",
  title: "Vitamin D",
  retailer: "cvs.com",
  category: "Health",
  price: "150.00",
  total: "150.00",
  currency: "USD",
  status: "voided",
  method: "voice",
  approved_by: null,
  declined_by: "Sam",
};

const detail: api.OrderDetail = {
  order: row,
  confirmation_transcript: "Sí, cómpralo",
  events: [
    {
      at: "2026-10-27T10:00:00Z",
      event: "drafted",
      actor: "system",
      status: "draft",
    },
    {
      at: "2026-10-27T10:05:00Z",
      event: "sent_to_caregiver",
      actor: "system",
      status: "awaiting_caregiver",
    },
    {
      at: "2026-10-27T11:00:00Z",
      event: "declined_and_voided",
      actor: "caregiver",
      status: "voided",
    },
  ],
  decisions: [
    {
      decision: "declined",
      caregiver: "Sam",
      note: "We have plenty at home",
      at: "2026-10-27T11:00:00Z",
    },
  ],
  conversation: [
    { role: "shopper", text: "Necesito vitamina D" },
    { role: "aide", text: "Encontré tres opciones." },
  ],
};

afterEach(() => {
  vi.resetAllMocks();
});

async function openPanel(onClose = vi.fn()) {
  vi.mocked(api.getOrderDetail).mockResolvedValue(detail);
  render(<OrderPanel shopper={rosa} row={row} onClose={onClose} />);
  const panel = screen.getByRole("dialog", { name: "Vitamin D" });
  await within(panel).findByRole("heading", { name: "What happened" });
  return { panel, onClose };
}

describe("OrderPanel", () => {
  it("focuses its heading and shows the order at a glance", async () => {
    const { panel } = await openPanel();

    expect(screen.getByRole("heading", { name: "Vitamin D" })).toHaveFocus();
    expect(panel).toHaveTextContent("StatusDeclined");
    expect(panel).toHaveTextContent("Total$150.00");
    expect(panel).toHaveTextContent("Confirmed byVoice");
    expect(panel).toHaveTextContent("Approved byDeclined by Sam");
    expect(api.getOrderDetail).toHaveBeenCalledWith(1, 7);
  });

  it("shows what Rosa said, the decision and note, and the timeline in words", async () => {
    const { panel } = await openPanel();

    const quote = within(panel).getByText("Sí, cómpralo");
    expect(quote).toHaveAttribute("lang", "es");
    expect(panel).toHaveTextContent(
      /Declined by Sam, .*: “?We have plenty at home/,
    );
    expect(panel).toHaveTextContent("Aide suggested this order");
    expect(panel).toHaveTextContent("Over a limit: sent to you");
    expect(panel).toHaveTextContent("Declined; payment released");
  });

  it("shows the conversation behind the order", async () => {
    const { panel } = await openPanel();

    const conversation = within(panel)
      .getByRole("heading", { name: "Conversation with Aide" })
      .closest("section") as HTMLElement;
    expect(
      within(conversation)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Rosa: Necesito vitamina D", "Aide: Encontré tres opciones."]);
  });

  it("closes with the Close button or Escape", async () => {
    const { panel, onClose } = await openPanel();

    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("says so if the details cannot load", async () => {
    vi.mocked(api.getOrderDetail).mockRejectedValue(new Error("offline"));
    render(<OrderPanel shopper={rosa} row={row} onClose={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load the details.",
    );
  });
});
