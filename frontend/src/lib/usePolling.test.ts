import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POLL_MS, usePolling } from "./usePolling";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePolling", () => {
  it("checks at once, then every 10 seconds", () => {
    const check = vi.fn();
    renderHook(() => usePolling(check));

    expect(check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(POLL_MS);
    expect(check).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(POLL_MS * 2);
    expect(check).toHaveBeenCalledTimes(4);
  });

  it("does nothing while inactive, and stops when it becomes inactive", () => {
    const check = vi.fn();
    const { rerender } = renderHook(({ active }) => usePolling(check, active), {
      initialProps: { active: false },
    });
    vi.advanceTimersByTime(POLL_MS * 3);
    expect(check).not.toHaveBeenCalled();

    rerender({ active: true });
    expect(check).toHaveBeenCalledTimes(1);

    rerender({ active: false });
    vi.advanceTimersByTime(POLL_MS * 3);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("stops when the page goes away", () => {
    const check = vi.fn();
    const { unmount } = renderHook(() => usePolling(check));

    unmount();
    vi.advanceTimersByTime(POLL_MS * 3);

    expect(check).toHaveBeenCalledTimes(1);
  });

  it("always uses the latest check", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ check }) => usePolling(check), {
      initialProps: { check: first },
    });

    rerender({ check: second });
    vi.advanceTimersByTime(POLL_MS);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
