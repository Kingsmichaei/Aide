import { useEffect, useState } from "react";

import { getHealth } from "../lib/api";

type Health = "checking" | "ok" | "down";

// Status colour is decorative; the word always carries the meaning.
const LABEL: Record<Health, string> = {
  checking: "Checking the connection…",
  ok: "Connected to Aide",
  down: "Cannot reach Aide right now",
};

const DOT: Record<Health, string> = {
  checking: "bg-neutral-500",
  ok: "bg-green-700",
  down: "bg-red-700",
};

export function HealthStatus() {
  const [health, setHealth] = useState<Health>("checking");

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then((result) => setHealth(result.status === "ok" ? "ok" : "down"))
      .catch(() => {
        if (!controller.signal.aborted) setHealth("down");
      });
    return () => controller.abort();
  }, []);

  return (
    <p role="status" className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`inline-block size-4 rounded-full ${DOT[health]}`}
      />
      {LABEL[health]}
    </p>
  );
}
