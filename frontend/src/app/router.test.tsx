import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MESSAGES } from "@/i18n";
import {
  ApiError,
  getProfile,
  getSessionUser,
  getUsers,
  type Profile,
} from "@/lib/api";

import { Providers } from "./providers";
import { makeQueryClient } from "./queryClient";
import { routes } from "./router";

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  getSessionUser: vi.fn(),
  getProfile: vi.fn(),
  getUsers: vi.fn(),
}));

const t = MESSAGES.en;

const maya: Profile = {
  id: 1,
  name: "Maya Chen",
  email: "maya@example.com",
  language: "en",
  currency: "USD",
  theme: "light",
  voice_speed: 1,
  auto_send: true,
  read_aloud: false,
};

function open(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <Providers client={makeQueryClient()}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return router;
}

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset().mockResolvedValue(maya);
  vi.mocked(getProfile).mockReset().mockResolvedValue(maya);
  vi.mocked(getUsers).mockReset().mockResolvedValue([]);
});

describe("routes", () => {
  it("sends someone who is not signed in to the sign-in page", async () => {
    vi.mocked(getSessionUser).mockRejectedValue(
      new ApiError(401, "Not signed in"),
    );
    const router = open("/shop");
    expect(
      await screen.findByRole("heading", { name: t.signIn.heading }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/signin");
  });

  it("says when the accounts can't load, and tries again", async () => {
    vi.mocked(getUsers)
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce([maya]);
    open("/signin");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t.signIn.loadFailed);
    fireEvent.click(
      within(alert).getByRole("button", { name: t.signIn.retry }),
    );

    expect(
      await screen.findByRole("button", {
        name: t.signIn.signInAs("Maya Chen"),
      }),
    ).toBeInTheDocument();
  });

  it("opens on Shop, the chat", async () => {
    const router = open("/");
    expect(
      await screen.findByRole("heading", { name: t.shop.greeting("Maya") }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/shop");
  });

  it("has the five sections in both the sidebar and the tab bar", async () => {
    open("/shop");
    await screen.findByRole("heading", { name: t.shop.greeting("Maya") });
    const navs = screen.getAllByRole("navigation", { name: t.nav.label });
    expect(navs).toHaveLength(2);
    for (const nav of navs) {
      const links = within(nav).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual([
        t.nav.shop,
        t.nav.watches,
        t.nav.orders,
        t.nav.planner,
        t.nav.settings,
      ]);
      expect(
        within(nav).getByRole("link", { name: t.nav.shop }),
      ).toHaveAttribute("aria-current", "page");
    }
  });

  it("moves between sections", async () => {
    open("/shop");
    await screen.findByRole("heading", { name: t.shop.greeting("Maya") });
    const [sidebar] = screen.getAllByRole("navigation", { name: t.nav.label });
    fireEvent.click(
      within(sidebar as HTMLElement).getByRole("link", { name: t.nav.orders }),
    );
    expect(await screen.findByText(t.empty.ordersTitle)).toBeInTheDocument();
  });

  it("shows who is signed in", async () => {
    open("/shop");
    expect(
      await screen.findByRole("button", {
        name: `${t.nav.account}: Maya Chen`,
      }),
    ).toBeInTheDocument();
  });
});
