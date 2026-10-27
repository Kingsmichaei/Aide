import { afterEach, describe, expect, it, vi } from "vitest";

import { API_URL, getHealth } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getHealth", () => {
  it("calls /health and returns the body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ status: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getHealth()).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/health`, {
      signal: undefined,
    });
  });

  it("throws when the server answers with an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    await expect(getHealth()).rejects.toThrow("HTTP 503");
  });
});
