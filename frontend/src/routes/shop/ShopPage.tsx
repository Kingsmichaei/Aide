import { HealthStatus } from "../../components/HealthStatus";

export function ShopPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 p-6 text-center">
      <title>Aide – Shop</title>
      <h1 className="text-3xl font-bold">Aide</h1>
      <p>Tell me what you need. I will help you find it.</p>
      <button
        type="button"
        className="min-h-16 w-full rounded-2xl bg-blue-800 px-8 text-2xl font-semibold text-white hover:bg-blue-900 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-blue-800 dark:focus-visible:outline-blue-300"
      >
        Talk to Aide
      </button>
      <HealthStatus />
    </main>
  );
}
