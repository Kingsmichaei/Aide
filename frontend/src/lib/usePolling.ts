import { useEffect, useRef } from "react";

/** How often apps check for news: approvals, alerts and order status. */
export const POLL_MS = 10_000;

/**
 * Run `check` now and every `everyMs` while `active`. Polling (not server-sent
 * events) because it works through any proxy, including Render's /api rewrite.
 */
export function usePolling(
  check: () => void,
  active = true,
  everyMs = POLL_MS,
): void {
  const latest = useRef(check);
  useEffect(() => {
    latest.current = check;
  });

  useEffect(() => {
    if (!active) return;
    latest.current();
    const timer = window.setInterval(() => latest.current(), everyMs);
    return () => window.clearInterval(timer);
  }, [active, everyMs]);
}
