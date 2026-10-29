import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useI18n } from "@/i18n/useI18n";
import {
  confirmOrder,
  type ConfirmReason,
  type Order,
  type RuleWarning,
} from "@/lib/api";
import { readBack } from "@/lib/readout";
import { useSettings } from "@/lib/settings-context";
import { canListen, speak, type ListenError } from "@/lib/speech";
import { useMediaQuery } from "@/lib/useMediaQuery";

import { MicButton } from "./MicButton";
import { PayPalButton } from "./PayPalButton";

type Phase = "review" | "pay" | "done";

interface Props {
  /** The drafted order to check out; null closes the sheet. */
  order: Order | null;
  onClose: () => void;
  /** The user said no (by voice): nothing was bought. */
  onDeclined: () => void;
  onPaid: (order: Order) => void;
}

/**
 * Checkout as a sheet: item, store, price, delivery, total and any spending-rule
 * warning, then PayPal, then the receipt. The confirmation sent to the server is
 * always the exact order on screen (CLAUDE.md payment rule 3).
 */
export function CheckoutSheet({ order, onClose, onDeclined, onPaid }: Props) {
  const wide = useMediaQuery("(min-width: 768px)");
  return (
    <Sheet open={order !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={wide ? "right" : "bottom"}
        className="flex max-h-[92svh] flex-col gap-0 rounded-t-2xl p-0 md:max-h-none md:w-[440px] md:max-w-none md:rounded-none"
      >
        {order && (
          <Checkout
            key={order.id}
            initial={order}
            onClose={onClose}
            onDeclined={onDeclined}
            onPaid={onPaid}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Checkout({
  initial,
  onClose,
  onDeclined,
  onPaid,
}: {
  initial: Order;
  onClose: () => void;
  onDeclined: () => void;
  onPaid: (order: Order) => void;
}) {
  const { t, money, language } = useI18n();
  const { settings } = useSettings();
  const [order, setOrder] = useState(initial);
  const [phase, setPhase] = useState<Phase>("review");
  const [warnings, setWarnings] = useState<RuleWarning[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const spoken = useRef<number | null>(null);

  const total = money(order.confirmed_total ?? order.total, order.currency);
  const delivery = Number(order.total) - Number(order.price);

  function say(pieces: string[]) {
    if (settings.read_aloud)
      speak(pieces, language, { rate: settings.voice_speed });
  }

  // Read the order back once when it opens (and again after any change).
  useEffect(() => {
    if (spoken.current === order.id) return;
    spoken.current = order.id;
    say(readBack(order, language));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per order
  }, [order.id]);

  function warningText(warning: RuleWarning): string {
    const amount = warning.amount
      ? money(warning.amount, warning.currency)
      : "";
    switch (warning.code) {
      case "ask_above":
        return t.checkout.askAbove(amount);
      case "over_budget":
        return t.checkout.overBudget(amount);
      case "other_currency":
        return t.checkout.otherCurrency(warning.currency);
    }
  }

  function changedText(reason: ConfirmReason, changed: Order): string {
    const newTotal = money(changed.total, changed.currency);
    switch (reason) {
      case "price_changed":
        return t.checkout.priceChanged(newTotal);
      case "retailer_changed":
        return t.checkout.retailerChanged(changed.retailer, newTotal);
      case "unavailable":
        return t.checkout.unavailable;
      default:
        return t.checkout.detailsChanged;
    }
  }

  async function confirm(transcript?: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await confirmOrder(order, {
        transcript,
        // The warnings on screen are the ones this yes accepts.
        acknowledged: warnings.map((w) => w.code),
      });
      setOrder(result.order);
      if (result.confirmed) {
        setPhase("pay");
        return;
      }
      switch (result.reason) {
        case "needs_extra_confirmation":
          setWarnings(result.warnings);
          setNote(null);
          say([...result.warnings.map(warningText), t.checkout.ask]);
          break;
        case "declined":
          onDeclined();
          break;
        case "unclear":
          setNote(t.checkout.unclear);
          say([t.checkout.unclear, ...readBack(result.order, language)]);
          break;
        default:
          if (result.reason) {
            setWarnings([]);
            setNote(changedText(result.reason, result.order));
          }
      }
    } catch {
      setError(t.checkout.checkFailed);
    } finally {
      setBusy(false);
    }
  }

  function voiceError(listenError: ListenError) {
    setError(t.speech[listenError]);
  }

  if (phase === "done") {
    return <Receipt order={order} onClose={onClose} />;
  }

  return (
    <>
      <SheetHeader className="border-b px-6 py-5">
        <SheetTitle className="text-lg">{t.checkout.title}</SheetTitle>
        <SheetDescription>{t.checkout.description}</SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div className="space-y-1">
          <p dir="auto" className="font-medium leading-snug">
            {order.title}
          </p>
          <p className="text-sm text-muted-foreground">{order.retailer}</p>
        </div>

        <dl className="space-y-2 text-sm">
          <Row
            label={t.checkout.price}
            value={money(order.price, order.currency)}
          />
          <Row
            label={t.checkout.delivery}
            value={
              delivery > 0
                ? money(delivery.toFixed(2), order.currency)
                : t.checkout.included
            }
          />
          <Separator className="my-3" />
          <Row label={t.checkout.total} value={total} strong />
        </dl>

        {note && (
          <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
            {note}
          </p>
        )}

        {warnings.length > 0 && phase === "review" && (
          <section
            role="alert"
            aria-labelledby="warnings-heading"
            className="space-y-2 rounded-xl border border-warning/40 bg-warning-soft p-4"
          >
            <h3
              id="warnings-heading"
              className="flex items-center gap-2 text-sm font-semibold text-foreground"
            >
              <TriangleAlert
                aria-hidden="true"
                className="size-4 text-warning"
              />
              {t.checkout.warningsTitle}
            </h3>
            <ul className="space-y-1 text-sm">
              {warnings.map((warning) => (
                <li key={warning.code}>{warningText(warning)}</li>
              ))}
            </ul>
          </section>
        )}

        {phase === "pay" && (
          <section aria-labelledby="pay-heading" className="space-y-3">
            <h3 id="pay-heading" className="text-sm font-semibold">
              {t.checkout.payTitle}
            </h3>
            <PayPalButton
              order={order}
              onPaid={(paid) => {
                setOrder(paid);
                setPhase("done");
                say([t.success.spoken(total, paid.title)]);
                onPaid(paid);
              }}
              onRecheck={(changed, reason) => {
                setOrder(changed);
                setPhase("review");
                setWarnings([]);
                setNote(
                  reason === "needs_extra_confirmation"
                    ? t.checkout.detailsChanged
                    : changedText(reason as ConfirmReason, changed),
                );
              }}
              onError={setError}
            />
          </section>
        )}

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>

      {phase === "review" && (
        <SheetFooter className="gap-3 border-t px-6 py-5">
          <Button
            type="button"
            size="lg"
            onClick={() => void confirm()}
            disabled={busy}
            className="price h-11 w-full text-[15px]"
          >
            {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
            {busy
              ? t.checkout.checking
              : warnings.length > 0
                ? t.checkout.buyAnyway(total)
                : t.checkout.buy(total)}
          </Button>
          {canListen() && (
            <div className="flex flex-col items-center gap-2">
              <MicButton
                variant="pill"
                language={language}
                disabled={busy}
                label={t.checkout.sayYes}
                stopLabel={t.shop.stopListening}
                onHeard={setHeard}
                onFinished={(text) => void confirm(text)}
                onError={voiceError}
              />
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {heard ? t.checkout.heard(heard) : t.checkout.voiceHint}
              </p>
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            {t.checkout.notNow}
          </Button>
        </SheetFooter>
      )}
    </>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>
        {label}
      </dt>
      <dd className={`price ${strong ? "text-lg font-semibold" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

/** After payment: a calm receipt with the order summary. */
function Receipt({ order, onClose }: { order: Order; onClose: () => void }) {
  const { t, money } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col items-center gap-3 px-6 pt-10 pb-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 aria-hidden="true" className="size-7" />
        </span>
        <SheetTitle asChild>
          <h2
            ref={heading}
            tabIndex={-1}
            className="text-xl font-semibold tracking-tight outline-none"
          >
            {t.success.title}
          </h2>
        </SheetTitle>
        <SheetDescription className="text-[15px]">
          {t.success.body(order.title, order.retailer)}
        </SheetDescription>
      </div>
      <dl className="mx-6 space-y-2 rounded-xl border bg-muted/40 p-4 text-sm">
        <Row
          label={t.success.totalPaid}
          value={money(order.confirmed_total ?? order.total, order.currency)}
          strong
        />
        <Row label={t.success.order} value={`#${order.id}`} />
        <Row label={t.success.paidWith} value="PayPal" />
      </dl>
      <SheetFooter className="mt-auto gap-2 px-6 py-5 sm:flex-col">
        <Button type="button" onClick={onClose} className="h-11 w-full">
          {t.success.keepShopping}
        </Button>
        <Button asChild variant="outline" className="h-11 w-full">
          <Link to="/orders">{t.success.viewOrders}</Link>
        </Button>
      </SheetFooter>
    </div>
  );
}
