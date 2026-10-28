import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "./lib/api";
import { routes } from "./routes";

const rosa: SessionUser = { id: 1, name: "Rosa", role: "shopper" };
const sam: SessionUser = { id: 2, name: "Sam", role: "caregiver" };

/** A fake API behind fetch. `me` is who the session cookie says is signed in. */
function fakeApi(initial: SessionUser | null) {
  let me = initial;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    // Whatever VITE_API_URL is, match on the path after it.
    const path = new URL(url, "http://app").pathname.replace(/^\/api/, "");
    if (path === "/auth/me") {
      return me
        ? Response.json(me)
        : Response.json({ detail: "Please sign in" }, { status: 401 });
    }
    if (path === "/auth/users") return Response.json([rosa, sam]);
    if (path === "/auth/session" && init?.method === "POST") {
      const { user_id } = JSON.parse(init.body as string) as {
        user_id: number;
      };
      me = user_id === rosa.id ? rosa : sam;
      return Response.json(me);
    }
    if (path === "/auth/session" && init?.method === "DELETE") {
      me = null;
      return new Response(null, { status: 204 });
    }
    if (path === "/care/shoppers") {
      return Response.json([{ id: 1, name: "Rosa", language: "en" }]);
    }
    if (path === "/health") return Response.json({ status: "ok" });
    if (path === "/shoppers/1/settings") {
      return Response.json({
        language: "en",
        voice_speed: 1,
        text_size: 20,
        auto_send: true,
        read_aloud: true,
      });
    }
    return Response.json({ detail: "not faked" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("routes", () => {
  it("signed out, /shop goes to the sign-in picker", async () => {
    fakeApi(null);
    const router = renderAt("/shop");

    expect(
      await screen.findByRole("heading", { name: "Who is using Aide?" }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/signin");
    expect(
      await screen.findByRole("button", { name: /Sign in as Rosa/ }),
    ).toHaveTextContent("Shopper");
    expect(
      screen.getByRole("button", { name: /Sign in as Sam/ }),
    ).toHaveTextContent("Caregiver");
  });

  it("picking the shopper signs in and opens the shop", async () => {
    const fetchMock = fakeApi(null);
    const router = renderAt("/signin");

    fireEvent.click(
      await screen.findByRole("button", { name: /Sign in as Rosa/ }),
    );

    expect(await screen.findByLabelText("Type your message")).toBeVisible();
    expect(router.state.location.pathname).toBe("/shop");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/session$/),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("picking the caregiver opens the dashboard with their shoppers", async () => {
    fakeApi(null);
    renderAt("/signin");

    fireEvent.click(
      await screen.findByRole("button", { name: /Sign in as Sam/ }),
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Caregiver dashboard",
      }),
    ).toBeVisible();
    expect(screen.getByText("Signed in as Sam")).toBeVisible();
    expect(await screen.findByText("Rosa")).toBeVisible();
  });

  it("a shopper cannot open /care", async () => {
    fakeApi(rosa);
    const router = renderAt("/care");

    expect(await screen.findByLabelText("Type your message")).toBeVisible();
    expect(router.state.location.pathname).toBe("/shop");
  });

  it("a caregiver cannot open /shop", async () => {
    fakeApi(sam);
    const router = renderAt("/shop/settings");

    expect(
      await screen.findByRole("heading", { name: "Caregiver dashboard" }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/care");
  });

  it("signing out returns to the picker", async () => {
    fakeApi(rosa);
    const router = renderAt("/shop");

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("heading", { name: "Who is using Aide?" }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe("/signin");
  });

  it("/ goes to the shop for a signed-in shopper", async () => {
    fakeApi(rosa);
    renderAt("/");

    expect(await screen.findByLabelText("Type your message")).toBeVisible();
  });
});
