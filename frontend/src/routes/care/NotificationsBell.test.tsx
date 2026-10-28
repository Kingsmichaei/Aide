import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../lib/api";
import { NotificationsBell } from "./NotificationsBell";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    getNotifications: vi.fn(),
    markNotificationsRead: vi.fn(),
  };
});

// Polling is driven by hand: `poll()` runs the latest check.
let latestCheck: (() => void) | null = null;
vi.mock("../../lib/usePolling", () => ({
  POLL_MS: 10_000,
  usePolling: (check: () => void) => {
    latestCheck = check;
  },
}));

async function poll() {
  const check = latestCheck;
  if (!check) throw new Error("not polling");
  await act(async () => check());
}

function alert(id: number, shopper: string, read = false): api.AppNotification {
  return {
    id,
    kind: "approval_needed",
    order_id: id,
    params: {
      shopper_name: shopper,
      title: "Vitamin D",
      total: "150.00",
      currency: "USD",
    },
    created_at: "2026-10-28T09:00:00Z",
    read_at: read ? "2026-10-28T10:00:00Z" : null,
  };
}

beforeEach(() => {
  vi.mocked(api.getNotifications).mockResolvedValue({
    unread: 1,
    items: [alert(2, "Rosa"), alert(1, "Rosa", true)],
  });
  vi.mocked(api.markNotificationsRead).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetAllMocks();
  latestCheck = null;
});

async function renderBell() {
  render(<NotificationsBell />);
  await poll();
}

describe("NotificationsBell", () => {
  it("shows the unread count in its name", async () => {
    await renderBell();

    const button = screen.getByRole("button", { name: "Alerts 1 unread" });
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("lists alerts in plain words, marking new ones with a word", async () => {
    await renderBell();

    fireEvent.click(screen.getByRole("button", { name: /Alerts/ }));

    const panel = screen.getByRole("region", { name: "Alerts" });
    const [fresh, old] = within(panel).getAllByRole("listitem");
    expect(fresh).toHaveTextContent(
      "New Rosa needs your approval for Vitamin D ($150.00). Review",
    );
    expect(old).not.toHaveTextContent("New");
    expect(
      within(panel).getAllByRole("link", { name: "Review" })[0],
    ).toHaveAttribute("href", "#queue-heading");
  });

  it("marks everything read", async () => {
    await renderBell();
    fireEvent.click(screen.getByRole("button", { name: /Alerts/ }));
    vi.mocked(api.getNotifications).mockResolvedValue({
      unread: 0,
      items: [alert(2, "Rosa", true), alert(1, "Rosa", true)],
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    });

    expect(api.markNotificationsRead).toHaveBeenCalledWith();
    expect(screen.getByRole("button", { name: "Alerts" })).toBeVisible();
  });

  it("announces an alert that arrives while the page is open", async () => {
    await renderBell();
    expect(screen.getByRole("status")).toHaveTextContent("");

    vi.mocked(api.getNotifications).mockResolvedValue({
      unread: 2,
      items: [alert(3, "Ana"), alert(2, "Rosa"), alert(1, "Rosa", true)],
    });
    await poll();

    expect(screen.getByRole("status")).toHaveTextContent(
      "New alert: Ana needs your approval for Vitamin D ($150.00).",
    );
    expect(
      screen.getByRole("button", { name: "Alerts 2 unread" }),
    ).toBeVisible();
  });
});
