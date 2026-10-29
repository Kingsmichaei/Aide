import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MESSAGES } from "@/i18n";
import {
  getCategories,
  getRules,
  saveRules,
  type SpendingRules,
} from "@/lib/api";
import { renderWithApp } from "@/test/render";

import { RulesSection } from "./RulesSection";

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  getRules: vi.fn(),
  saveRules: vi.fn(),
  getCategories: vi.fn(),
}));

const t = MESSAGES.en.settings;

const rules: SpendingRules = {
  currency: "USD",
  monthly_budget: "600.00",
  ask_above: "150.00",
  blocked_categories: [
    { slug: "alcohol", title: "Alcohol", path: ["Food", "Alcohol"] },
  ],
};

beforeEach(() => {
  vi.mocked(getRules).mockReset().mockResolvedValue(rules);
  vi.mocked(saveRules)
    .mockReset()
    .mockImplementation(async () => rules);
  vi.mocked(getCategories).mockReset();
});

describe("RulesSection", () => {
  it("shows the saved rules", async () => {
    renderWithApp(<RulesSection />);
    expect(await screen.findByLabelText(t.monthlyBudget)).toHaveValue("600.00");
    expect(screen.getByLabelText(t.askAbove)).toHaveValue("150.00");
    expect(screen.getByText("Food › Alcohol")).toBeInTheDocument();
  });

  it("explains a wrong amount next to the field and does not save", async () => {
    renderWithApp(<RulesSection />);
    const budget = await screen.findByLabelText(t.monthlyBudget);
    fireEvent.change(budget, { target: { value: "lots" } });
    fireEvent.change(screen.getByLabelText(t.askAbove), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: t.save }));

    expect(budget).toHaveAccessibleDescription(t.invalidMoney);
    expect(budget).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(t.askAbove)).toHaveAccessibleDescription(
      t.positive,
    );
    expect(saveRules).not.toHaveBeenCalled();
  });

  it("saves empty amounts as no rule, and unblocked categories", async () => {
    renderWithApp(<RulesSection />);
    fireEvent.change(await screen.findByLabelText(t.monthlyBudget), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: t.unblock("Alcohol") }));
    expect(screen.getByText(t.noneBlocked)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.save }));

    await waitFor(() => expect(saveRules).toHaveBeenCalled());
    expect(vi.mocked(saveRules).mock.calls[0]?.[0]).toEqual({
      monthly_budget: null,
      ask_above: "150.00",
      blocked_categories: [],
    });
  });

  it("finds and blocks a category", async () => {
    vi.mocked(getCategories).mockResolvedValue([
      { slug: "vapes", title: "Vapes", path: ["Health", "Vapes"] },
    ]);
    renderWithApp(<RulesSection />);
    fireEvent.change(await screen.findByLabelText(t.findCategory), {
      target: { value: "vape" },
    });

    fireEvent.click(
      await screen.findByRole("button", { name: t.block("Vapes") }),
    );
    expect(getCategories).toHaveBeenCalledWith("vape");
    expect(
      screen.getByRole("button", { name: t.unblock("Vapes") }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: t.block("Vapes") }),
    ).toBeDisabled();
  });
});
