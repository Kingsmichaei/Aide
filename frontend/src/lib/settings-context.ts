import { createContext, useContext } from "react";

import type { ShopperSettings } from "./api";

export const DEFAULT_SETTINGS: ShopperSettings = {
  language: "en",
  voice_speed: 1,
  text_size: 20,
  auto_send: true,
  read_aloud: true,
};

export interface SettingsValue {
  settings: ShopperSettings;
  /** Applies the change at once and saves it; rejects (and rolls back) if saving fails. */
  update: (changes: Partial<ShopperSettings>) => Promise<void>;
}

export const SettingsContext = createContext<SettingsValue>({
  settings: DEFAULT_SETTINGS,
  update: async () => {},
});

export function useSettings(): SettingsValue {
  return useContext(SettingsContext);
}
