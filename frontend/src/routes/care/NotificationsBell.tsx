import { useCallback, useId, useRef, useState } from "react";

import {
  getNotifications,
  markNotificationsRead,
  type NotificationsResponse,
} from "../../lib/api";
import { usePolling } from "../../lib/usePolling";
import { describe } from "./alerts";

/** Badge with the unread count, and the list of alerts behind it. */
export function NotificationsBell() {
  const panelId = useId();
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [news, setNews] = useState("");
  const lastUnread = useRef<number | null>(null);

  const load = useCallback(() => {
    getNotifications()
      .then((latest) => {
        // Announce new alerts that arrive while the page is open.
        if (
          lastUnread.current !== null &&
          latest.unread > lastUnread.current &&
          latest.items[0]
        ) {
          setNews(`New alert: ${describe(latest.items[0])}`);
        }
        lastUnread.current = latest.unread;
        setData(latest);
      })
      .catch(() => {
        // Keep what we have; the next check tries again.
      });
  }, []);

  usePolling(load);

  async function markAllRead() {
    await markNotificationsRead().catch(() => {});
    load();
  }

  const unread = data?.unread ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 items-center gap-2 rounded-lg border-2 border-neutral-500 px-3 font-semibold focus-visible:outline-4 focus-visible:outline-blue-800"
      >
        Alerts{" "}
        {unread > 0 && (
          <span className="rounded-full bg-red-800 px-2 text-sm text-white">
            {unread} <span className="sr-only">unread</span>
          </span>
        )}
      </button>
      <p role="status" className="sr-only">
        {news}
      </p>
      {open && (
        <section
          id={panelId}
          aria-label="Alerts"
          className="absolute end-0 z-10 mt-2 flex w-80 max-w-[90vw] flex-col gap-3 rounded-xl border border-neutral-300 bg-white p-4 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {!data || data.items.length === 0 ? (
            <p>No alerts yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.items.map((notification) => (
                <li
                  key={notification.id}
                  className={notification.read_at ? "" : "font-semibold"}
                >
                  {!notification.read_at && (
                    <>
                      <span className="me-2 rounded bg-blue-800 px-1 text-xs text-white">
                        New
                      </span>{" "}
                    </>
                  )}
                  {describe(notification)}{" "}
                  {notification.kind === "approval_needed" && (
                    <a
                      href="#queue-heading"
                      onClick={() => setOpen(false)}
                      className="underline"
                    >
                      Review
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          {unread > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="min-h-11 self-start rounded-lg px-2 underline"
            >
              Mark all as read
            </button>
          )}
        </section>
      )}
    </div>
  );
}
