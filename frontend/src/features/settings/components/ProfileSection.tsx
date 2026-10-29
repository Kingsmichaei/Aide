import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGE_NAMES } from "@/i18n";
import { useI18n } from "@/i18n/useI18n";
import { CURRENCIES, type Currency, type Language } from "@/lib/api";
import { useSettings } from "@/lib/settings-context";

import { checkEmail } from "../validation";
import { Field } from "./Field";
import { SettingsCard } from "./SettingsCard";

const LANGUAGES = Object.keys(LANGUAGE_NAMES) as Language[];

export function ProfileSection() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const [name, setName] = useState(settings.name);
  const [email, setEmail] = useState(settings.email ?? "");
  const [language, setLanguage] = useState<Language>(settings.language);
  const [currency, setCurrency] = useState<Currency>(settings.currency);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [saving, setSaving] = useState(false);

  const changed =
    name.trim() !== settings.name ||
    email.trim() !== (settings.email ?? "") ||
    language !== settings.language ||
    currency !== settings.currency;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = {
      name: name.trim() ? undefined : t.settings.required,
      email: checkEmail(email) ? undefined : t.settings.invalidEmail,
    };
    setErrors(found);
    if (found.name || found.email) return;
    setSaving(true);
    try {
      await update({
        name: name.trim(),
        language,
        currency,
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      toast.success(t.settings.saved);
    } catch {
      toast.error(t.settings.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <SettingsCard
        title={t.settings.profileTitle}
        description={t.settings.profileDescription}
        footer={
          <Button type="submit" disabled={saving || !changed}>
            {saving ? t.settings.saving : t.settings.save}
          </Button>
        }
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={t.settings.name} error={errors.name}>
            {(control) => (
              <Input
                {...control}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            )}
          </Field>
          <Field
            label={t.settings.email}
            help={t.settings.emailHelp}
            error={errors.email}
          >
            {(control) => (
              <Input
                {...control}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            )}
          </Field>
          <Field label={t.settings.language} help={t.settings.languageHelp}>
            {(control) => (
              <Select
                value={language}
                onValueChange={(v) => setLanguage(v as Language)}
              >
                <SelectTrigger {...control} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((code) => (
                    <SelectItem key={code} value={code} lang={code}>
                      {LANGUAGE_NAMES[code]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={t.settings.currency} help={t.settings.currencyHelp}>
            {(control) => (
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as Currency)}
              >
                <SelectTrigger {...control} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </div>
      </SettingsCard>
    </form>
  );
}
