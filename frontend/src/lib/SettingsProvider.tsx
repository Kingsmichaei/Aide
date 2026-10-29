import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { direction } from "../i18n";
import {
  getProfile,
  updateProfile,
  type Profile,
  type ProfileChanges,
} from "./api";
import { DEFAULT_SETTINGS, SettingsContext } from "./settings-context";

interface Props {
  children: ReactNode;
}

/** Loads the signed-in user's profile and keeps the page in step with it. */
export function SettingsProvider({ children }: Props) {
  const [settings, setSettings] = useState<Profile>(DEFAULT_SETTINGS);
  const current = useRef(settings);
  useEffect(() => {
    current.current = settings;
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch(() => {
        // Keep the defaults; the app still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Arabic turns the whole page right-to-left.
  useEffect(() => {
    const html = document.documentElement;
    html.lang = settings.language;
    html.dir = direction(settings.language);
  }, [settings.language]);

  const update = useCallback(async (changes: ProfileChanges) => {
    const previous = current.current;
    setSettings({ ...previous, ...changes });
    try {
      setSettings(await updateProfile(changes));
    } catch (error) {
      setSettings(previous);
      throw error;
    }
  }, []);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext value={value}>{children}</SettingsContext>;
}
