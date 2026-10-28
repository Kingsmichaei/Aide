import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { direction } from "../i18n";
import { getSettings, updateSettings, type ShopperSettings } from "./api";
import { DEFAULT_SETTINGS, SettingsContext } from "./settings-context";

interface Props {
  shopperId: number;
  children: ReactNode;
}

export function SettingsProvider({ shopperId, children }: Props) {
  const [settings, setSettings] = useState<ShopperSettings>(DEFAULT_SETTINGS);
  const current = useRef(settings);
  useEffect(() => {
    current.current = settings;
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    getSettings(shopperId)
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch(() => {
        // Keep the defaults; the shopper can still use the app.
      });
    return () => {
      cancelled = true;
    };
  }, [shopperId]);

  // Text size applies app-wide through one CSS variable on <html>; Arabic
  // turns the whole page right-to-left.
  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty("--text-size", String(settings.text_size));
    html.lang = settings.language;
    html.dir = direction(settings.language);
  }, [settings.text_size, settings.language]);

  const update = useCallback(
    async (changes: Partial<ShopperSettings>) => {
      const previous = current.current;
      setSettings({ ...previous, ...changes });
      try {
        setSettings(await updateSettings(shopperId, changes));
      } catch (error) {
        setSettings(previous);
        throw error;
      }
    },
    [shopperId],
  );

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext value={value}>{children}</SettingsContext>;
}
