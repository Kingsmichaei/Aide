import { HealthStatus } from "../../components/HealthStatus";

export function CarePage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <title>Aide – Caregiver</title>
      <h1 className="text-3xl font-bold">Caregiver dashboard</h1>
      <HealthStatus />
    </main>
  );
}
