import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import {
  ApiError,
  getCategories,
  getLimits,
  LIMIT_CURRENCIES,
  saveLimits,
  type CaredForShopper,
  type Category,
  type LimitCurrency,
} from "../../lib/api";
import { validateLimits, type LimitErrors, type LimitValues } from "./limits";

type SaveState = "idle" | "saving" | "saved" | "failed";

export function LimitsForm({ shopper }: { shopper: CaredForShopper }) {
  const ids = {
    perOrder: useId(),
    monthly: useId(),
    currency: useId(),
    search: useId(),
  };
  const [loaded, setLoaded] = useState(false);
  const [isSet, setIsSet] = useState(false);
  const [values, setValues] = useState<LimitValues>({
    perOrder: "",
    monthly: "",
  });
  const [currency, setCurrency] = useState<LimitCurrency>("USD");
  const [blocked, setBlocked] = useState<Category[]>([]);
  const [roots, setRoots] = useState<Category[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Category[] | null>(null);
  const [errors, setErrors] = useState<LimitErrors>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const inputs = {
    perOrder: useRef<HTMLInputElement>(null),
    monthly: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    getLimits(shopper.id)
      .then((limits) => {
        setIsSet(limits.is_set);
        setValues({
          perOrder: limits.per_order_max ?? "",
          monthly: limits.monthly_max ?? "",
        });
        setCurrency(limits.currency);
        setBlocked(limits.blocked_categories);
        setLoaded(true);
      })
      .catch(() => setProblem("Could not load the limits. Please reload."));
    getCategories()
      .then(setRoots)
      .catch(() => setRoots([]));
  }, [shopper.id]);

  const isBlocked = (slug: string) => blocked.some((c) => c.slug === slug);
  const block = (category: Category) =>
    setBlocked((current) =>
      current.some((c) => c.slug === category.slug)
        ? current
        : [...current, category],
    );
  const unblock = (slug: string) =>
    setBlocked((current) => current.filter((c) => c.slug !== slug));
  const rootSlugs = new Set(roots?.map((c) => c.slug));
  const extraBlocked = blocked.filter((c) => !rootSlugs.has(c.slug));

  async function search() {
    const text = query.trim();
    if (!text) return;
    try {
      setResults(await getCategories(text));
    } catch {
      setResults([]);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateLimits(values);
    setErrors(found);
    setProblem(null);
    const first = (["perOrder", "monthly"] as const).find((key) => found[key]);
    if (first) {
      inputs[first].current?.focus();
      return;
    }
    setSaveState("saving");
    try {
      const saved = await saveLimits(shopper.id, {
        per_order_max: values.perOrder.trim(),
        monthly_max: values.monthly.trim(),
        currency,
        blocked_categories: blocked.map((c) => c.slug),
      });
      setIsSet(true);
      setBlocked(saved.blocked_categories);
      setSaveState("saved");
    } catch (error) {
      setSaveState("failed");
      const detail = error instanceof ApiError ? error.detail : null;
      const unknown =
        detail && typeof detail === "object" && "unknown_categories" in detail
          ? (detail as { unknown_categories: string[] }).unknown_categories
          : null;
      setProblem(
        unknown
          ? `These categories no longer exist: ${unknown.join(", ")}. Remove them and save again.`
          : "Could not save the limits. Please try again.",
      );
    }
  }

  const field = (key: keyof LimitValues, label: string, help: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={ids[key]} className="font-semibold">
        {label}
      </label>
      <p id={`${ids[key]}-help`} className="text-sm">
        {help}
      </p>
      <div className="flex items-center gap-2">
        <input
          id={ids[key]}
          ref={inputs[key]}
          inputMode="decimal"
          autoComplete="off"
          value={values[key]}
          onChange={(event) =>
            setValues((current) => ({ ...current, [key]: event.target.value }))
          }
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={`${ids[key]}-help${errors[key] ? ` ${ids[key]}-error` : ""}`}
          className="w-40 rounded-lg border-2 border-neutral-500 px-3 py-2 aria-invalid:border-red-700 dark:bg-neutral-900"
        />
        <span>{currency}</span>
      </div>
      {errors[key] && (
        <p
          id={`${ids[key]}-error`}
          className="text-sm font-semibold text-red-800 dark:text-red-300"
        >
          Error: {errors[key]}
        </p>
      )}
    </div>
  );

  if (!loaded) {
    return problem ? (
      <p role="alert">{problem}</p>
    ) : (
      <p aria-busy="true">Loading limits…</p>
    );
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      aria-labelledby="limits-heading"
      className="flex flex-col gap-6 rounded-xl border border-neutral-300 p-4 dark:border-neutral-700"
    >
      <h2 id="limits-heading" className="text-2xl font-semibold">
        Spending limits for {shopper.name}
      </h2>
      {!isSet && (
        <p>
          No limits yet: {shopper.name}&apos;s orders go through without your
          approval until you save some.
        </p>
      )}

      {field(
        "perOrder",
        "Limit for one order",
        `Any order above this waits for your approval before ${shopper.name} pays.`,
      )}
      {field(
        "monthly",
        "Limit for each month",
        `Once ${shopper.name}'s spending this month would go over this, every order waits for your approval. It must be at least the limit for one order.`,
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={ids.currency} className="font-semibold">
          Currency
        </label>
        <p id={`${ids.currency}-help`} className="text-sm">
          Orders in any other currency always wait for your approval.
        </p>
        <select
          id={ids.currency}
          value={currency}
          onChange={(event) => setCurrency(event.target.value as LimitCurrency)}
          aria-describedby={`${ids.currency}-help`}
          className="w-40 rounded-lg border-2 border-neutral-500 px-3 py-2 dark:bg-neutral-900"
        >
          {LIMIT_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-semibold">Blocked categories</legend>
        <p className="text-sm">
          Aide never shows {shopper.name} products from these categories.
          Blocking a category also blocks everything inside it.
        </p>
        {roots === null ? (
          <p aria-busy="true">Loading categories…</p>
        ) : roots.length === 0 ? (
          <p>Categories are unavailable right now. Try again later.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {roots.map((category) => (
              <li key={category.slug}>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isBlocked(category.slug)}
                    onChange={(event) =>
                      event.target.checked
                        ? block(category)
                        : unblock(category.slug)
                    }
                    className="size-5"
                  />
                  {category.title}
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor={ids.search} className="font-semibold">
            Find a narrower category
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id={ids.search}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault(); // search, don't save the form
                  void search();
                }
              }}
              placeholder="For example: vitamins"
              className="rounded-lg border-2 border-neutral-500 px-3 py-2 dark:bg-neutral-900"
            />
            <button
              type="button"
              onClick={() => void search()}
              className="min-h-11 rounded-lg border-2 border-blue-800 px-4 font-semibold dark:border-blue-300"
            >
              Search
            </button>
          </div>
          {results !== null && (
            <div role="status">
              {results.length === 0 ? (
                <p>No categories found.</p>
              ) : (
                <ul
                  aria-label="Matching categories"
                  className="mt-2 flex flex-col gap-1"
                >
                  {results.map((category) => (
                    <li key={category.slug} className="flex items-center gap-3">
                      <span>{category.path.join(" › ")}</span>
                      <button
                        type="button"
                        onClick={() => block(category)}
                        disabled={isBlocked(category.slug)}
                        className="min-h-11 rounded-lg px-3 underline disabled:no-underline disabled:opacity-60"
                      >
                        {isBlocked(category.slug)
                          ? "Blocked"
                          : `Block ${category.title}`}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {extraBlocked.length > 0 && (
          <div>
            <p className="font-semibold">Also blocked</p>
            <ul className="flex flex-col gap-1">
              {extraBlocked.map((category) => (
                <li key={category.slug} className="flex items-center gap-3">
                  <span>{category.path.join(" › ")}</span>
                  <button
                    type="button"
                    onClick={() => unblock(category.slug)}
                    className="min-h-11 rounded-lg px-3 underline"
                  >
                    Remove {category.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>

      {problem && (
        <p
          role="alert"
          className="font-semibold text-red-800 dark:text-red-300"
        >
          {problem}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saveState === "saving"}
          className="min-h-11 rounded-lg bg-blue-800 px-6 font-semibold text-white hover:bg-blue-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:opacity-60"
        >
          {saveState === "saving" ? "Saving…" : "Save limits"}
        </button>
        <p role="status">{saveState === "saved" && "Saved."}</p>
      </div>
    </form>
  );
}
