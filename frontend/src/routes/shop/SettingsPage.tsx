import { useState } from "react";

import type { Language, ShopperSettings } from "../../lib/api";
import { useSettings } from "../../lib/settings-context";
import { canListen, canSpeak, speak } from "../../lib/speech";

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "ar", label: "العربية" },
];

const TEXT_SIZES = [20, 24, 28, 32];

const VOICE_SPEEDS = [
  { value: 0.8, label: "Slow" },
  { value: 1, label: "Normal" },
];

const ON_OFF = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

const VOICE_SAMPLE: Record<Language, string> = {
  en: "Hello. This is how I will sound.",
  es: "Hola. Así es como voy a sonar.",
  fr: "Bonjour. Voici ma voix.",
  ar: "مرحبا. هكذا سيكون صوتي.",
};

type SaveState = "idle" | "saved" | "failed";

export function SettingsPage() {
  const { settings, update } = useSettings();
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
      <title>Aide – Settings</title>
      <h1 className="text-3xl font-bold">Settings</h1>

      <Choices
        legend="Language"
        name="language"
        options={LANGUAGES}
        value={settings.language}
        onChange={(language) => change({ language })}
      />

      <Choices
        legend="Text size"
        name="text_size"
        options={TEXT_SIZES.map((size) => ({
          value: size,
          label: `${size} px`,
        }))}
        value={settings.text_size}
        onChange={(text_size) => change({ text_size })}
      />

      <Choices
        legend="Voice speed"
        name="voice_speed"
        options={VOICE_SPEEDS}
        value={voiceSpeed}
        onChange={(voice_speed) => change({ voice_speed })}
      />

      {canSpeak() && (
        <Choices
          legend="Read Aide's replies aloud"
          name="read_aloud"
          options={ON_OFF}
          value={settings.read_aloud ? "on" : "off"}
          onChange={(value) => change({ read_aloud: value === "on" })}
        />
      )}

      {canListen() && (
        <Choices
          legend="Send my message when I stop speaking"
          name="auto_send"
          options={ON_OFF}
          value={settings.auto_send ? "on" : "off"}
          onChange={(value) => change({ auto_send: value === "on" })}
        />
      )}

      {canSpeak() && (
        <button
          type="button"
          onClick={() =>
            speak(VOICE_SAMPLE[settings.language], settings.language, {
              rate: settings.voice_speed,
            })
          }
          className="min-h-16 rounded-2xl border-2 border-blue-800 px-8 text-2xl font-semibold focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-800 dark:border-blue-300"
        >
          Test voice
        </button>
      )}

      <p role="status" className="font-semibold">
        {saveState === "saved" && "Saved."}
      </p>
      {saveState === "failed" && (
        <p
          role="alert"
          className="font-semibold text-red-800 dark:text-red-300"
        >
          Could not save. Please try again.
        </p>
      )}
    </main>
  );
}

interface ChoicesProps<T extends string | number> {
  legend: string;
  name: string;
  options: { value: T; label: string }[];
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
