import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LedgerRow } from "../../lib/api";
import { approvedByWord, methodWord, openOnEnter, statusWord } from "./ledger";
import { OrdersLedger } from "./OrdersLedger";

function row(id: number, changes: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id,
    created_at: "2026-10-20T10:00:00Z",
    title: `Item ${id}`,
    retailer: "target.com",
    category: "Kitchen",
    price: "40.00",
    total: "40.00",
    currency: "USD",
    status: "captured",
    method: "button",
    approved_by: null,
    declined_by: null,
    ...changes,
  };
}

const ROWS: LedgerRow[] = [
  row(1),
  row(2, {
    title: "Vitamin D",
    category: "Health",
    total: "150.00",
    method: "voice",
    approved_by: "Sam",
    created_at: "2026-10-25T10:00:00Z",
  }),
  row(3, {
    title: "Wine",
    status: "voided",
    declined_by: "Sam",
    created_at: "2026-10-22T10:00:00Z",
  }),
  row(4, {
    title: "Blanket",
    status: "awaiting_caregiver",
    created_at: "2026-10-27T10:00:00Z",
  }),
];

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderLedger(onOpen = vi.fn()) {
  render(<OrdersLedger shopperName="Rosa" rows={ROWS} onOpen={onOpen} />);
  return onOpen;
}

/** The grid's data rows, as the text of each row. */
async function gridRows() {
  const grid = await screen.findByRole("grid", { name: "Orders for Rosa" });
  await waitFor(() =>
    expect(within(grid).getAllByRole("row").length).toBeGreaterThan(1),
  );
  return within(grid)
    .getAllByRole("row")
    .filter((r) => within(r).queryAllByRole("gridcell").length > 0);
}

describe("ledger words", () => {
  it("names every status in words", () => {
    expect(statusWord(row(1), "Rosa")).toBe("Paid");
    expect(statusWord(row(1, { status: "awaiting_caregiver" }), "Rosa")).toBe(
      "Waiting for you",
    );
    expect(statusWord(row(1, { status: "awaiting_shopper" }), "Rosa")).toBe(
      "Waiting for Rosa",
    );
    expect(
      statusWord(row(1, { status: "voided", declined_by: "Sam" }), "Rosa"),
    ).toBe("Declined");
    expect(statusWord(row(1, { status: "voided" }), "Rosa")).toBe("Cancelled");
    expect(statusWord(row(1, { status: "refunded" }), "Rosa")).toBe("Refunded");
  });

  it("says who approved, or why nobody had to", () => {
    expect(approvedByWord(row(1, { approved_by: "Sam" }))).toBe("Sam");
    expect(approvedByWord(row(1, { declined_by: "Sam" }))).toBe(
      "Declined by Sam",
    );
    expect(approvedByWord(row(1))).toBe("Not needed (within limit)");
    expect(approvedByWord(row(1, { status: "awaiting_caregiver" }))).toBe("—");
    expect(methodWord(row(1, { method: "voice" }))).toBe("Voice");
    expect(methodWord(row(1, { method: null }))).toBe("—");
  });
});

describe("OrdersLedger", () => {
  it("is a labelled grid with the columns the caregiver needs", async () => {
    renderLedger();
    const grid = await screen.findByRole("grid", { name: "Orders for Rosa" });

    const headers = within(grid)
      .getAllByRole("columnheader")
      // The sorted column also shows its sort order ("Date 1"); compare names only.
      .map((h) => h.textContent?.trim().replace(/\s+\d+$/, ""));
    expect(headers).toEqual([
      "Date",
      "Item",
      "Retailer",
      "Category",
      "Price",
      "Status",
      "Method",
      "Approved by",
    ]);
  });

  it("shows newest first, with status, method and approver as words", async () => {
    renderLedger();
    const rows = await gridRows();

    expect(
      rows.map((r) => within(r).getAllByRole("gridcell")[1]?.textContent),
    ).toEqual(["Blanket", "Vitamin D", "Wine", "Item 1"]);
    const vitamin = rows[1] as HTMLElement;
    expect(vitamin).toHaveTextContent("$150.00");
    expect(vitamin).toHaveTextContent("Paid");
    expect(vitamin).toHaveTextContent("Voice");
    expect(vitamin).toHaveTextContent("Sam");
    expect(rows[0]).toHaveTextContent("Waiting for you");
    expect(rows[2]).toHaveTextContent("Declined by Sam");
  });

  it("quick search filters on any column, including the status word", async () => {
    renderLedger();
    await gridRows();

    fireEvent.change(screen.getByLabelText("Search orders"), {
      target: { value: "declined" },
    });

    await waitFor(async () => {
      const rows = await gridRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent("Wine");
    });
  });

  // Click (onRowClicked) and Enter (onCellKeyDown) both open the panel. In
  // jsdom AG Grid's focus handling builds a MouseEvent jsdom rejects, so the
  // real interaction is in the browser script; the Enter rule is tested here.
  it("Enter opens the order; other keys do not", () => {
    const onOpen = vi.fn();
    openOnEnter("Enter", ROWS[2], onOpen);
    openOnEnter(" ", ROWS[1], onOpen);
    openOnEnter("Enter", undefined, onOpen);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(ROWS[2]);
  });

  it("downloads the orders as CSV with readable values", async () => {
    let csv: Blob | null = null;
    // AG Grid clicks a hidden download link with a MouseEvent jsdom rejects.
    vi.stubGlobal("MouseEvent", class extends Event {});
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: (blob: Blob) => {
        csv = blob;
        return "blob:orders";
      },
      revokeObjectURL: () => {},
    });
    renderLedger();
    await gridRows();

    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));

    await waitFor(() => expect(csv).not.toBeNull());
    const text = await (csv as unknown as Blob).text();
    expect(text).toContain(
      '"Date","Item","Retailer","Category","Price","Status","Method","Approved by"',
    );
    expect(text).toContain('"Vitamin D","target.com","Health"');
    expect(text).toContain('"Paid","Voice","Sam"');
  });
});
