import { useState } from "react";

import { LANGUAGE_NAMES } from "../../i18n";
import { useI18n } from "../../i18n/useI18n";
import type { Language, ShopperSettings } from "../../lib/api";
import { useSettings } from "../../lib/settings-context";
import { canListen, canSpeak, speak } from "../../lib/speech";

// Each language keeps its own name and lang, so it can be found and read
// correctly whatever the page language is.
const LANGUAGES = (Object.keys(LANGUAGE_NAMES) as Language[]).map(
  (language) => ({
    value: language,
    label: LANGUAGE_NAMES[language],
    lang: language,
  }),
);

const TEXT_SIZES = [20, 24, 28, 32];

type SaveState = "idle" | "saved" | "failed";

export function SettingsPage() {
  const { settings, update } = useSettings();
  const { t } = useI18n();
  const onOff = [
    { value: "on", label: t.settings.on },
    { value: "off", label: t.settings.off },
  ];
  const [saveState, setSaveState] = useState<SaveState>("idle");

  async function change(changes: Partial<ShopperSettings>) {
    try {
      await update(changes);
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    }
  }

  const voiceSpeed = settings.voice_speed < 0.9 ? 0.8 : 1;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-4 sm:p-6">
      <title>{t.settings.pageTitle}</title>
      <h1 className="text-3xl font-bold">{t.settings.heading}</h1>

      <Choices
        legend={t.settings.language}
        name="language"
        options={LANGUAGES}
        value={settings.language}
        onChange={(language) => change({ language })}
      />

      <Choices
        legend={t.settings.textSize}
        name="text_size"
        options={TEXT_SIZES.map((size) => ({
          value: size,
          label: t.settings.px(size),
        }))}
        value={settings.text_size}
        onChange={(text_size) => change({ text_size })}
      />

      <Choices
        legend={t.settings.voiceSpeed}
        name="voice_speed"
        options={[
          { value: 0.8, label: t.settings.slow },
          { value: 1, label: t.settings.normal },
        ]}
        value={voiceSpeed}
        onChange={(voice_speed) => change({ voice_speed })}
      />

      {canSpeak() && (
        <Choices
          legend={t.settings.readAloud}
          name="read_aloud"
          options={onOff}
          value={settings.read_aloud ? "on" : "off"}
          onChange={(value) => change({ read_aloud: value === "on" })}
        />
      )}

      {canListen() && (
        <Choices
          legend={t.settings.autoSend}
          name="auto_send"
          options={onOff}
          value={settings.auto_send ? "on" : "off"}
          onChange={(value) => change({ auto_send: value === "on" })}
        />
      )}

      {canSpeak() && (
        <button
          type="button"
          onClick={() =>
            speak(t.settings.voiceSample, settings.language, {
              rate: settings.voice_speed,
            })
          }
          className="min-h-16 rounded-2xl border-2 border-blue-800 px-8 text-2xl font-semibold focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-800 dark:border-blue-300"
        >
          {t.settings.testVoice}
        </button>
      )}

      <p role="status" className="font-semibold">
        {saveState === "saved" && t.settings.saved}
      </p>
      {saveState === "failed" && (
        <p
          role="alert"
          className="font-semibold text-red-800 dark:text-red-300"
        >
          {t.settings.saveFailed}
        </p>
      )}
    </main>
  );
}

interface ChoicesProps<T extends string | number> {
  legend: string;
  name: string;
  options: { value: T; label: string; lang?: string }[];
  value: T;
  onChange: (value: T) => void;
}

function Choices<T extends string | number>({
  legend,
  name,
  options,
  value,
  onChange,
}: ChoicesProps<T>) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-2xl font-bold">{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            lang={option.lang}
            className="flex min-h-16 cursor-pointer items-center gap-4 rounded-2xl border-2 border-neutral-400 px-5 text-xl has-[:checked]:border-blue-800 has-[:checked]:bg-blue-50 has-[:focus-visible]:outline-4 has-[:focus-visible]:outline-blue-800 dark:has-[:checked]:border-blue-300 dark:has-[:checked]:bg-blue-950"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="size-6 accent-blue-800"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
