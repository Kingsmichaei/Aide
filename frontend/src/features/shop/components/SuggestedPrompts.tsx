import { ArrowUpRight } from "lucide-react";

import { useI18n } from "@/i18n/useI18n";

/** Starting points on the empty screen; one tap sends the prompt. */
export function SuggestedPrompts({
  onPick,
}: {
  onPick: (prompt: string) => void;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="suggestions-heading" className="space-y-3">
      <h2
        id="suggestions-heading"
        className="text-sm font-medium text-muted-foreground"
      >
        {t.shop.suggestionsLabel}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-3">
        {t.shop.suggestions.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              onClick={() => onPick(prompt)}
              className="group flex h-full w-full items-start justify-between gap-3 rounded-xl border bg-card p-4 text-start text-sm shadow-xs transition hover:border-primary/40 hover:bg-primary-soft/50 hover:shadow-sm"
            >
              <span dir="auto">{prompt}</span>
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary rtl:-scale-x-100"
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
