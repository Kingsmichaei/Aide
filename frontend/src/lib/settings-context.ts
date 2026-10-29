import { createContext, useContext } from "react";

import type { Profile, ProfileChanges } from "./api";

/** Used until the profile loads (and in tests). */
export const DEFAULT_SETTINGS: Profile = {
  id: 0,
  name: "",
  email: null,
  language: "en",
  currency: "USD",
  theme: "system",
  voice_speed: 1,
  auto_send: true,
  read_aloud: false,
};

export interface SettingsValue {
  settings: Profile;
  /** Applies the change at once and saves it; rejects (and rolls back) if saving fails. */
  update: (changes: ProfileChanges) => Promise<void>;
}

export const SettingsContext = createContext<SettingsValue>({
  settings: DEFAULT_SETTINGS,
  update: async () => {},
});

export function useSettings(): SettingsValue {
  return useContext(SettingsContext);
}
