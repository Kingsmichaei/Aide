import { Monitor, Moon, Sun, Volume2 } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/useI18n";
import type { ProfileChanges, Theme } from "@/lib/api";
import { useSettings } from "@/lib/settings-context";
import { canListen, canSpeak, speak } from "@/lib/speech";
import { cn } from "@/lib/utils";

import { SettingsCard } from "./SettingsCard";

export function AppearanceSection() {
  const { t, language } = useI18n();
  const { settings, update } = useSettings();

  // These apply at once, and roll back with a message if saving fails.
  function change(changes: ProfileChanges) {
    update(changes).catch(() => toast.error(t.settings.saveFailed));
  }

  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: t.settings.light, icon: Sun },
    { value: "dark", label: t.settings.dark, icon: Moon },
    { value: "system", label: t.settings.system, icon: Monitor },
  ];

  return (
    <div className="grid gap-6">
      <SettingsCard
        title={t.settings.appearanceTitle}
        description={t.settings.appearanceDescription}
      >
        <fieldset>
          <legend className="sr-only">{t.settings.theme}</legend>
          <div className="grid grid-cols-3 gap-3">
            {themes.map(({ value, label, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-xl border bg-card p-4 text-sm font-medium shadow-xs transition hover:bg-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                  settings.theme === value &&
                    "border-primary bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft",
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={settings.theme === value}
                  onChange={() => change({ theme: value })}
                  className="sr-only"
                />
                <Icon aria-hidden="true" className="size-5" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </SettingsCard>

      <SettingsCard
        title={t.settings.voiceTitle}
        description={t.settings.voiceDescription}
      >
        {canSpeak() && (
          <Toggle
            label={t.settings.readAloud}
            help={t.settings.readAloudHelp}
            checked={settings.read_aloud}
            onChange={(read_aloud) => change({ read_aloud })}
          />
        )}
        {canListen() && (
          <Toggle
            label={t.settings.autoSend}
            help={t.settings.autoSendHelp}
            checked={settings.auto_send}
            onChange={(auto_send) => change({ auto_send })}
          />
        )}
        {canSpeak() && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">
                {t.settings.voiceSpeed}
              </legend>
              <div className="inline-flex rounded-lg border p-0.5">
                {[
                  { value: 0.8, label: t.settings.slow },
                  { value: 1, label: t.settings.normal },
                ].map((option) => {
                  const active =
                    (settings.voice_speed < 0.9 ? 0.8 : 1) === option.value;
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        "cursor-pointer rounded-md px-3 py-1.5 text-sm transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <input
                        type="radio"
                        name="voice_speed"
                        checked={active}
                        onChange={() => change({ voice_speed: option.value })}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                speak(t.settings.voiceSample, language, {
                  rate: settings.voice_speed,
                })
              }
            >
              <Volume2 aria-hidden="true" />
              {t.settings.testVoice}
            </Button>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}

function Toggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="grid gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-help`} className="text-[13px] text-muted-foreground">
          {help}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={`${id}-help`}
      />
    </div>
  );
}
