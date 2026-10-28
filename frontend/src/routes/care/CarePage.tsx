import { useEffect, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";

import { HealthStatus } from "../../components/HealthStatus";
import {
  getCaredForShoppers,
  signOut,
  type CaredForShopper,
  type SessionUser,
} from "../../lib/api";

// The caregiver dashboard is English-only for now: caregivers have no
// language setting yet. The shopper app is fully translated.
export function CarePage() {
  const caregiver = useLoaderData<SessionUser>();
  const navigate = useNavigate();
  const [shoppers, setShoppers] = useState<CaredForShopper[] | null>(null);

  useEffect(() => {
    getCaredForShoppers()
      .then(setShoppers)
      .catch(() => setShoppers([]));
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <title>Aide – Caregiver</title>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Caregiver dashboard</h1>
        <p className="flex items-center gap-4">
          Signed in as {caregiver.name}
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
        </p>
      </div>
      <HealthStatus />
      <section aria-labelledby="shoppers-heading" className="space-y-2">
        <h2 id="shoppers-heading" className="text-2xl font-semibold">
          People you look after
        </h2>
        {shoppers === null ? (
          <p>Loading…</p>
        ) : shoppers.length === 0 ? (
          <p>No one yet. A shopper needs to link you as their caregiver.</p>
        ) : (
          <ul className="list-disc ps-6">
            {shoppers.map((shopper) => (
              <li key={shopper.id}>{shopper.name}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
