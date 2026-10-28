import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../lib/api";
import { routes } from "../../routes";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return { ...actual, getSettings: vi.fn(), updateSettings: vi.fn() };
});

const speakMock = vi.fn();
const cancelMock = vi.fn();

beforeEach(() => {
  vi.mocked(api.getSettings).mockResolvedValue({
    language: "es",
    voice_speed: 0.8,
    text_size: 24,
  });
  vi.stubGlobal("speechSynthesis", { speak: speakMock, cancel: cancelMock });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      lang = "";
      rate = 1;
      constructor(public text: string) {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  document.documentElement.removeAttribute("style");
});

function renderSettings() {
  render(
    <RouterProvider
      router={createMemoryRouter(routes, {
        initialEntries: ["/shop/settings"],
      })}
    />,
  );
}

describe("SettingsPage", () => {
  it("loads saved settings on start and applies text size app-wide", async () => {
    renderSettings();

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Español" })).toBeChecked(),
    );
    expect(screen.getByRole("radio", { name: "24 px" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Slow" })).toBeChecked();
    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue("--text-size"),
      ).toBe("24"),
    );
    expect(document.documentElement.lang).toBe("es");
  });

  it("saves a change and shows Saved", async () => {
    vi.mocked(api.updateSettings).mockResolvedValue({
      language: "es",
      voice_speed: 0.8,
      text_size: 32,
    });
    renderSettings();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "24 px" })).toBeChecked(),
    );

    fireEvent.click(screen.getByRole("radio", { name: "32 px" }));

    expect(await screen.findByText("Saved.")).toBeVisible();
    expect(api.updateSettings).toHaveBeenCalledWith(1, { text_size: 32 });
    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue("--text-size"),
      ).toBe("32"),
    );
  });

  it("rolls back and says so when saving fails", async () => {
    vi.mocked(api.updateSettings).mockRejectedValue(new Error("offline"));
    renderSettings();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "24 px" })).toBeChecked(),
    );

    fireEvent.click(screen.getByRole("radio", { name: "32 px" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save",
    );
    expect(screen.getByRole("radio", { name: "24 px" })).toBeChecked();
  });

  it("Test voice speaks a sample in the chosen language and speed", async () => {
    renderSettings();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Español" })).toBeChecked(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Test voice" }));

    const [utterance] = speakMock.mock.calls[0] as [
      { text: string; lang: string; rate: number },
    ];
    expect(utterance.lang).toBe("es-ES");
    expect(utterance.rate).toBe(0.8);
    expect(utterance.text).toMatch(/^Hola/);
  });
});
