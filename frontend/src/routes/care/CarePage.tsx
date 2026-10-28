import { useCallback, useEffect, useId, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";

import {
  getCaredForShoppers,
  getLedger,
  getSpending,
  signOut,
  type CaredForShopper,
  type LedgerRow,
  type SessionUser,
  type Spending,
} from "../../lib/api";
import { usePolling } from "../../lib/usePolling";
import { ApprovalQueue } from "./ApprovalQueue";
import { LimitsForm } from "./LimitsForm";
import { NotificationsBell } from "./NotificationsBell";
import { OrderPanel } from "./OrderPanel";
import { OrdersLedger } from "./OrdersLedger";
import { SpendCharts } from "./SpendCharts";
import { SummaryCards } from "./SummaryCards";

// The caregiver dashboard is English-only for now: caregivers have no
// language setting yet. The shopper app is fully translated.
export function CarePage() {
  const caregiver = useLoaderData<SessionUser>();
  const navigate = useNavigate();
  const [shoppers, setShoppers] = useState<CaredForShopper[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const pickerId = useId();
  const selected =
    shoppers?.find((shopper) => shopper.id === selectedId) ?? shoppers?.[0];

  useEffect(() => {
    getCaredForShoppers()
      .then(setShoppers)
      .catch(() => setShoppers([]));
  }, []);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <title>Aide – Caregiver</title>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Caregiver dashboard</h1>
          {selected && <p>Looking after {selected.name}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {shoppers && shoppers.length > 1 && (
            <p className="flex items-center gap-2">
              <label htmlFor={pickerId}>Show</label>
              <select
                id={pickerId}
                value={selected?.id}
                onChange={(event) => setSelectedId(Number(event.target.value))}
                className="min-h-11 rounded-lg border-2 border-neutral-500 px-3 dark:bg-neutral-900"
              >
                {shoppers.map((shopper) => (
                  <option key={shopper.id} value={shopper.id}>
                    {shopper.name}
                  </option>
                ))}
              </select>
            </p>
          )}
          <NotificationsBell />
          <span>Signed in as {caregiver.name}</span>
          <button
            type="button"
            onClick={() => {
              void signOut()
                .catch(() => {})
                .then(() => navigate("/signin"));
            }}
            className="min-h-11 rounded-lg px-3 underline focus-visible:outline-4 focus-visible:outline-blue-800"
          >
            Sign out
          </button>
        </div>
      </header>

      {shoppers === null && <p aria-busy="true">Loading…</p>}
      {shoppers?.length === 0 && (
        <p>No one yet. A shopper needs to link you as their caregiver.</p>
      )}
      {selected && <ShopperDashboard key={selected.id} shopper={selected} />}
    </main>
  );
}

/** Summary cards, ledger, charts and the approval queue for one shopper. */
function ShopperDashboard({ shopper }: { shopper: CaredForShopper }) {
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [spending, setSpending] = useState<Spending | null>(null);
  const [open, setOpen] = useState<LedgerRow | null>(null);

  const load = useCallback(() => {
    getLedger(shopper.id)
      .then(setRows)
      .catch(() => {});
    getSpending(shopper.id)
      .then(setSpending)
      .catch(() => {});
  }, [shopper.id]);

  // Approvals made elsewhere (or new orders) show up without a reload.
  usePolling(load);

  return (
    <>
      <SummaryCards spending={spending} shopperName={shopper.name} />
      {/* Queue on the right on wide screens; below the ledger on phones. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <OrdersLedger
            shopperName={shopper.name}
            rows={rows}
            onOpen={setOpen}
          />
          <SpendCharts spending={spending} />
        </div>
        <ApprovalQueue onDecided={load} />
      </div>
      <LimitsForm shopper={shopper} />
      {open && (
        <OrderPanel
          key={open.id}
          shopper={shopper}
          row={open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
