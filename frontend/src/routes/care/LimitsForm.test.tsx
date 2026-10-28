import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../lib/api";
import { validateLimits } from "./limits";
import { LimitsForm } from "./LimitsForm";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    getLimits: vi.fn(),
    getCategories: vi.fn(),
    saveLimits: vi.fn(),
  };
});

const rosa: api.CaredForShopper = { id: 1, name: "Rosa", language: "en" };
const health = { slug: "health", title: "Health", path: ["Health"] };
const alcohol = { slug: "alcohol", title: "Alcohol", path: ["Alcohol"] };
const vitamins = {
  slug: "vitamins",
  title: "Vitamins",
  path: ["Health", "Vitamins"],
};
const saved: api.Limits = {
  is_set: true,
  per_order_max: "100.00",
  monthly_max: "500.00",
  currency: "USD",
  blocked_categories: [alcohol, vitamins],
};

beforeEach(() => {
  vi.mocked(api.getLimits).mockResolvedValue(saved);
  vi.mocked(api.getCategories).mockImplementation(async (query = "") =>
    query ? [vitamins] : [health, alcohol],
  );
});

afterEach(() => {
  vi.resetAllMocks();
});

async function renderForm() {
  render(<LimitsForm shopper={rosa} />);
  return screen.findByRole("form", { name: "Spending limits for Rosa" });
}

describe("validateLimits", () => {
  it("accepts positive amounts with up to two decimals", () => {
    expect(validateLimits({ perOrder: "49.99", monthly: "50" })).toEqual({});
  });

  it.each([
    [{ perOrder: "", monthly: "100" }, "perOrder", "Enter an amount."],
    [{ perOrder: "-5", monthly: "100" }, "perOrder", "Use a number like"],
    [{ perOrder: "0", monthly: "100" }, "perOrder", "more than 0"],
    [{ perOrder: "10.005", monthly: "100" }, "perOrder", "Use a number like"],
    [{ perOrder: "abc", monthly: "100" }, "perOrder", "Use a number like"],
    [{ perOrder: "100", monthly: "0.00" }, "monthly", "more than 0"],
    [{ perOrder: "200", monthly: "100" }, "monthly", "at least the per-order"],
  ] as const)("%o -> %s error", (values, field, message) => {
    expect(validateLimits(values)[field]).toContain(message);
  });
});

describe("LimitsForm", () => {
  it("shows the saved limits and blocked categories", async () => {
    const form = await renderForm();

    expect(within(form).getByLabelText("Limit for one order")).toHaveValue(
      "100.00",
    );
    expect(within(form).getByLabelText("Limit for each month")).toHaveValue(
      "500.00",
    );
    expect(within(form).getByLabelText("Currency")).toHaveValue("USD");
    expect(
      await within(form).findByRole("checkbox", { name: "Alcohol" }),
    ).toBeChecked();
    expect(
      within(form).getByRole("checkbox", { name: "Health" }),
    ).not.toBeChecked();
    // Narrower categories are listed with their path and can be removed.
    expect(within(form).getByText("Health › Vitamins")).toBeVisible();
    expect(
      within(form).getByRole("button", { name: "Remove Vitamins" }),
    ).toBeVisible();
  });

  it("each amount has help text tied to it", async () => {
    const form = await renderForm();

    expect(
      within(form).getByLabelText("Limit for one order"),
    ).toHaveAccessibleDescription(
      "Any order above this waits for your approval before Rosa pays.",
    );
  });

  it("says when no limits are set yet", async () => {
    vi.mocked(api.getLimits).mockResolvedValue({
      is_set: false,
      per_order_max: null,
      monthly_max: null,
      currency: "USD",
      blocked_categories: [],
    });
    const form = await renderForm();

    expect(within(form).getByText(/No limits yet/)).toBeVisible();
  });

  it("refuses a monthly limit below the per-order limit, without saving", async () => {
    const form = await renderForm();
    const monthly = within(form).getByLabelText("Limit for each month");

    fireEvent.change(monthly, { target: { value: "50" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save limits" }));

    expect(monthly).toHaveAttribute("aria-invalid", "true");
    expect(monthly).toHaveAccessibleDescription(
      expect.stringContaining(
        "The monthly limit must be at least the per-order limit.",
      ),
    );
    expect(monthly).toHaveFocus();
    expect(api.saveLimits).not.toHaveBeenCalled();
  });

  it("saves amounts, currency and chosen categories", async () => {
    vi.mocked(api.saveLimits).mockResolvedValue({
      ...saved,
      blocked_categories: [alcohol, vitamins, health],
    });
    const form = await renderForm();

    fireEvent.change(within(form).getByLabelText("Limit for one order"), {
      target: { value: "75" },
    });
    fireEvent.change(within(form).getByLabelText("Currency"), {
      target: { value: "EUR" },
    });
    fireEvent.click(
      await within(form).findByRole("checkbox", { name: "Health" }),
    );
    fireEvent.click(within(form).getByRole("button", { name: "Save limits" }));

    expect(await within(form).findByText("Saved.")).toBeVisible();
    expect(api.saveLimits).toHaveBeenCalledWith(1, {
      per_order_max: "75",
      monthly_max: "500.00",
      currency: "EUR",
      blocked_categories: ["alcohol", "vitamins", "health"],
    });
  });

  it("finds and blocks a narrower category, never free text", async () => {
    vi.mocked(api.getLimits).mockResolvedValue({
      ...saved,
      blocked_categories: [],
    });
    vi.mocked(api.saveLimits).mockResolvedValue(saved);
    const form = await renderForm();

    fireEvent.change(within(form).getByLabelText("Find a narrower category"), {
      target: { value: "vitamins" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Search" }));
    fireEvent.click(
      await within(form).findByRole("button", { name: "Block Vitamins" }),
    );
    fireEvent.click(within(form).getByRole("button", { name: "Save limits" }));

    expect(api.getCategories).toHaveBeenLastCalledWith("vitamins");
    await waitFor(() =>
      expect(api.saveLimits).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ blocked_categories: ["vitamins"] }),
      ),
    );
  });

  it("Enter in the search box searches instead of saving", async () => {
    const form = await renderForm();
    const search = within(form).getByLabelText("Find a narrower category");

    fireEvent.change(search, { target: { value: "vit" } });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(
      await within(form).findByRole("list", { name: "Matching categories" }),
    ).toBeVisible();
    expect(api.saveLimits).not.toHaveBeenCalled();
  });

  it("explains a refused category from the server", async () => {
    vi.mocked(api.saveLimits).mockRejectedValue(
      new api.ApiError(422, {
        message: "These are not Channel3 categories",
        unknown_categories: ["old-slug"],
      }),
    );
    const form = await renderForm();

    fireEvent.click(within(form).getByRole("button", { name: "Save limits" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "These categories no longer exist: old-slug.",
    );
  });
});
