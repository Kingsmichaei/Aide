import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/useI18n";
import {
  ApiError,
  getCategories,
  getRules,
  saveRules,
  type Category,
  type SpendingRules,
} from "@/lib/api";

import { checkMoney, type MoneyProblem } from "../validation";
import { Field, type ControlProps } from "./Field";
import { SettingsCard } from "./SettingsCard";

export function RulesSection() {
  const rules = useQuery({ queryKey: ["rules"], queryFn: getRules });
  if (rules.isPending) {
    return <Skeleton aria-busy="true" className="h-96 w-full rounded-xl" />;
  }
  if (rules.isError) {
    return <RulesError retry={() => void rules.refetch()} />;
  }
  return <RulesForm rules={rules.data} />;
}

function RulesError({ retry }: { retry: () => void }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="flex items-center justify-between rounded-xl border p-4 text-sm"
    >
      {t.settings.saveFailed}
      <Button variant="outline" size="sm" onClick={retry}>
        {t.shop.retry}
      </Button>
    </div>
  );
}

function RulesForm({ rules }: { rules: SpendingRules }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [budget, setBudget] = useState(rules.monthly_budget ?? "");
  const [askAbove, setAskAbove] = useState(rules.ask_above ?? "");
  const [blocked, setBlocked] = useState<Category[]>(rules.blocked_categories);
  const [errors, setErrors] = useState<{ budget?: string; askAbove?: string }>(
    {},
  );
  const save = useMutation({
    mutationFn: saveRules,
    onSuccess: (saved) => {
      client.setQueryData(["rules"], saved);
      toast.success(t.settings.saved);
    },
    onError: (error) => {
      const detail = error instanceof ApiError ? error.detail : null;
      const unknown =
        detail && typeof detail === "object" && "unknown_categories" in detail
          ? (detail as { unknown_categories: string[] }).unknown_categories
          : null;
      toast.error(
        unknown
          ? t.settings.unknownCategories(unknown.join(", "))
          : t.settings.saveFailed,
      );
    },
  });

  const moneyError = (problem: MoneyProblem | null) =>
    problem === "invalid"
      ? t.settings.invalidMoney
      : problem === "positive"
        ? t.settings.positive
        : undefined;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = {
      budget: moneyError(checkMoney(budget)),
      askAbove: moneyError(checkMoney(askAbove)),
    };
    setErrors(found);
    if (found.budget || found.askAbove) return;
    save.mutate({
      monthly_budget: budget.trim() || null,
      ask_above: askAbove.trim() || null,
      blocked_categories: blocked.map((c) => c.slug),
    });
  }

  const block = (category: Category) =>
    setBlocked((current) =>
      current.some((c) => c.slug === category.slug)
        ? current
        : [...current, category],
    );

  return (
    <form onSubmit={onSubmit} noValidate>
      <SettingsCard
        title={t.settings.rulesTitle}
        description={t.settings.rulesDescription}
        footer={
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t.settings.saving : t.settings.save}
          </Button>
        }
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label={t.settings.monthlyBudget}
            help={t.settings.monthlyBudgetHelp}
            error={errors.budget}
          >
            {(control) => (
              <MoneyInput
                control={control}
                currency={rules.currency}
                value={budget}
                onChange={setBudget}
              />
            )}
          </Field>
          <Field
            label={t.settings.askAbove}
            help={t.settings.askAboveHelp}
            error={errors.askAbove}
          >
            {(control) => (
              <MoneyInput
                control={control}
                currency={rules.currency}
                value={askAbove}
                onChange={setAskAbove}
              />
            )}
          </Field>
        </div>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">{t.settings.blocked}</legend>
          <p className="-mt-1 text-[13px] text-muted-foreground">
            {t.settings.blockedHelp}
          </p>
          {blocked.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t.settings.noneBlocked}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {blocked.map((category) => (
                <li key={category.slug}>
                  <Badge
                    variant="secondary"
                    className="gap-1 py-1 ps-2.5 pe-1 text-[13px]"
                  >
                    {category.path.join(" › ")}
                    <button
                      type="button"
                      onClick={() =>
                        setBlocked((cur) =>
                          cur.filter((c) => c.slug !== category.slug),
                        )
                      }
                      aria-label={t.settings.unblock(category.title)}
                      className="rounded-full p-0.5 hover:bg-background"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <CategorySearch blocked={blocked} onBlock={block} />
        </fieldset>
      </SettingsCard>
    </form>
  );
}

function MoneyInput({
  control,
  currency,
  value,
  onChange,
}: {
  control: ControlProps;
  currency: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Input
        {...control}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="price pe-14"
      />
      <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted-foreground">
        {currency}
      </span>
    </div>
  );
}

function CategorySearch({
  blocked,
  onBlock,
}: {
  blocked: Category[];
  onBlock: (category: Category) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  // Wait for a pause in typing before asking Channel3.
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const results = useQuery({
    queryKey: ["categories", term],
    queryFn: () => getCategories(term),
    enabled: term.length > 1,
  });
  const isBlocked = (slug: string) => blocked.some((c) => c.slug === slug);

  return (
    <div className="grid gap-2">
      <Field label={t.settings.findCategory}>
        {(control) => (
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
            />
            <Input
              {...control}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) =>
                event.key === "Enter" && event.preventDefault()
              }
              placeholder={t.settings.findCategoryPlaceholder}
              className="ps-9"
            />
          </div>
        )}
      </Field>
      {term.length > 1 && (
        <div role="status" className="text-sm">
          {results.isFetching ? (
            <Skeleton className="h-9 w-full" />
          ) : results.data?.length === 0 ? (
            <p className="text-muted-foreground">{t.settings.noMatches}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {results.data?.map((category) => (
                <li
                  key={category.slug}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 truncate">
                    {category.path.join(" › ")}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isBlocked(category.slug)}
                    onClick={() => onBlock(category)}
                    aria-label={t.settings.block(category.title)}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
