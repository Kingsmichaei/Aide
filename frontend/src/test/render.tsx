import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";

import { Providers } from "@/app/providers";
import { makeQueryClient } from "@/app/queryClient";
import type { Profile } from "@/lib/api";
import { DEFAULT_SETTINGS, SettingsContext } from "@/lib/settings-context";

/** Render a screen with the app's providers, a router and a signed-in profile. */
export function renderWithApp(
  ui: ReactNode,
  { settings = {} }: { settings?: Partial<Profile> } = {},
) {
  const value = {
    settings: { ...DEFAULT_SETTINGS, id: 1, name: "Maya Chen", ...settings },
    update: async () => {},
  };
  return render(
    <Providers client={makeQueryClient()}>
      <SettingsContext.Provider value={value}>
        <MemoryRouter>{ui}</MemoryRouter>
      </SettingsContext.Provider>
    </Providers>,
  );
}
