import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routes } from "./routes";

function renderAt(path: string) {
  render(
    <RouterProvider
      router={createMemoryRouter(routes, { initialEntries: [path] })}
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("routes", () => {
  it("/shop shows the chat form", () => {
    renderAt("/shop");

    expect(screen.getByLabelText("Type your message")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send" })).toHaveClass(
      "min-h-16",
    );
  });

  it("/care shows the dashboard heading and reports an unreachable API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    renderAt("/care");

    expect(
      screen.getByRole("heading", { level: 1, name: "Caregiver dashboard" }),
    ).toBeVisible();
    await screen.findByText("Cannot reach Aide right now");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Cannot reach Aide right now",
    );
  });

  it("/ redirects to /shop", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ status: "ok" })),
    );
    renderAt("/");

    expect(screen.getByLabelText("Type your message")).toBeVisible();
  });
});
