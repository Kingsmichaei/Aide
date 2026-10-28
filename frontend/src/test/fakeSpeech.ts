import { vi } from "vitest";

/** A stand-in for the browser's SpeechRecognition that tests can drive. */
export class FakeRecognition {
  static last: FakeRecognition | undefined;
  static failToStart = false;

  lang = "";
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => {
    if (FakeRecognition.failToStart) throw new Error("InvalidStateError");
  });
  // Like the browser, these only ask to stop; tests call end() when it has.
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    FakeRecognition.last = this;
  }

  /** Simulate the browser reporting results: [transcript, isFinal] pairs. */
  hear(...parts: [string, boolean][]) {
    this.onresult?.({
      results: parts.map(([transcript, isFinal]) =>
        Object.assign([{ transcript }], { isFinal }),
      ),
    });
  }

  /** Simulate the browser finishing. */
  end() {
    this.onend?.();
  }

  /** Simulate the browser giving up with an error, then ending. */
  fail(error: string) {
    this.onerror?.({ error });
    this.onend?.();
  }

  static reset() {
    FakeRecognition.last = undefined;
    FakeRecognition.failToStart = false;
  }
}
