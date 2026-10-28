import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canListen,
  canSpeak,
  listen,
  pickVoice,
  speak,
  stopSpeaking,
  type ListenHandlers,
} from "./speech";
import { FakeRecognition } from "../test/fakeSpeech";

function handlers() {
  return {
    onTranscript: vi.fn<ListenHandlers["onTranscript"]>(),
    onError: vi.fn<ListenHandlers["onError"]>(),
    onEnd: vi.fn<ListenHandlers["onEnd"]>(),
  };
}

function voice(lang: string, isDefault = false): SpeechSynthesisVoice {
  return { lang, default: isDefault, name: lang } as SpeechSynthesisVoice;
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeRecognition.reset();
});

describe("speech to text", () => {
  it("is unavailable when the browser has no recognition (Firefox)", () => {
    expect(canListen()).toBe(false);
    expect(listen("en", handlers())).toBeUndefined();
  });

  it("uses the prefixed webkit version (Chrome, Safari)", () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    expect(canListen()).toBe(true);
  });

  it("listens in the shopper's language with live results", () => {
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    listen("ar", handlers());

    const recognition = FakeRecognition.last;
    expect(recognition?.lang).toBe("ar-SA");
    expect(recognition?.interimResults).toBe(true);
    expect(recognition?.continuous).toBe(false);
    expect(recognition?.start).toHaveBeenCalled();
  });

  it("reports the transcript as it grows, then as final", () => {
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    const h = handlers();
    listen("es", h);
    const recognition = FakeRecognition.last;

    recognition?.hear(["necesito ", false]);
    recognition?.hear(["necesito ", true], ["pilas AA", false]);
    recognition?.hear(["necesito ", true], ["pilas AA", true]);

    expect(h.onTranscript.mock.calls).toEqual([
      ["necesito", false],
      ["necesito pilas AA", false],
      ["necesito pilas AA", true],
    ]);
  });

  it.each([
    ["not-allowed", "not-allowed"],
    ["service-not-allowed", "not-allowed"],
    ["no-speech", "no-speech"],
    ["audio-capture", "no-mic"],
    ["network", "network"],
    ["language-not-supported", "unknown"],
  ])("maps the browser error %s to %s", (browserError, expected) => {
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    const h = handlers();
    listen("en", h);

    FakeRecognition.last?.onerror?.({ error: browserError });

    expect(h.onError).toHaveBeenCalledWith(expected);
  });

  it("stop() ends listening and keeps the transcript", () => {
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    const h = handlers();
    const listening = listen("en", h);

    listening?.stop();
    FakeRecognition.last?.hear(["batteries", true]);
    FakeRecognition.last?.onend?.();

    expect(FakeRecognition.last?.stop).toHaveBeenCalled();
    expect(h.onTranscript).toHaveBeenCalledWith("batteries", true);
    expect(h.onEnd).toHaveBeenCalledOnce();
  });

  it("cancel() drops late results and the aborted error", () => {
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    const h = handlers();
    const listening = listen("en", h);

    listening?.cancel();
    FakeRecognition.last?.hear(["batteries", true]);
    FakeRecognition.last?.onerror?.({ error: "aborted" });

    expect(FakeRecognition.last?.abort).toHaveBeenCalled();
    expect(h.onTranscript).not.toHaveBeenCalled();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it("reports an error if the browser refuses to start", () => {
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    FakeRecognition.failToStart = true;
    const h = handlers();

    expect(listen("en", h)).toBeUndefined();
    expect(h.onError).toHaveBeenCalledWith("unknown");
    expect(h.onEnd).toHaveBeenCalled();
  });
});

describe("pickVoice", () => {
  it("prefers an exact language and region match", () => {
    const voices = [voice("es-MX", true), voice("es-ES"), voice("en-US")];
    expect(pickVoice(voices, "es")?.lang).toBe("es-ES");
  });

  it("falls back to another region of the same language", () => {
    const voices = [voice("en-US"), voice("fr-CA")];
    expect(pickVoice(voices, "fr")?.lang).toBe("fr-CA");
  });

  it("understands underscores (Android) and prefers the default voice", () => {
    const voices = [voice("ar_EG"), voice("ar_SA"), voice("ar-SA", true)];
    expect(pickVoice(voices, "ar")).toBe(voices[2]);
  });

  it("returns undefined when no voice speaks the language", () => {
    expect(pickVoice([voice("en-US")], "ar")).toBeUndefined();
  });
});

describe("text to speech", () => {
  const speakMock = vi.fn();
  const cancelMock = vi.fn();
  const voices = [voice("en-US"), voice("fr-FR")];

  beforeEach(() => {
    speakMock.mockReset();
    cancelMock.mockReset();
    vi.stubGlobal("speechSynthesis", {
      speak: speakMock,
      cancel: cancelMock,
      getVoices: () => voices,
    });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        lang = "";
        rate = 1;
        voice: SpeechSynthesisVoice | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(public text: string) {}
      },
    );
  });

  it("speaks with the shopper's language, voice and speed", () => {
    speak("Bonjour", "fr", { rate: 0.8 });

    const [utterance] = speakMock.mock.calls[0] as [SpeechSynthesisUtterance];
    expect(utterance.text).toBe("Bonjour");
    expect(utterance.lang).toBe("fr-FR");
    expect(utterance.voice).toBe(voices[1]);
    expect(utterance.rate).toBe(0.8);
  });

  it("cancels what is already being said first", () => {
    speak("One", "en");
    expect(cancelMock.mock.invocationCallOrder[0]).toBeLessThan(
      speakMock.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("calls onEnd once when speaking finishes", () => {
    const onEnd = vi.fn();
    speak("Hello", "en", { onEnd });

    const [utterance] = speakMock.mock.calls[0] as [SpeechSynthesisUtterance];
    utterance.onend?.({} as SpeechSynthesisEvent);
    utterance.onerror?.({} as SpeechSynthesisErrorEvent);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("queues several pieces and ends after the last one", () => {
    const onEnd = vi.fn();
    speak(["Here are two.", "", "Option 1.", "Option 2."], "en", { onEnd });

    const utterances = speakMock.mock.calls.map(
      ([utterance]) => utterance as SpeechSynthesisUtterance,
    );
    expect(utterances.map((u) => u.text)).toEqual([
      "Here are two.",
      "Option 1.",
      "Option 2.",
    ]);
    expect(cancelMock).toHaveBeenCalledOnce();
    utterances[0]?.onend?.({} as SpeechSynthesisEvent);
    expect(onEnd).not.toHaveBeenCalled();
    utterances[2]?.onend?.({} as SpeechSynthesisEvent);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("ends early when a piece is interrupted", () => {
    const onEnd = vi.fn();
    speak(["One.", "Two."], "en", { onEnd });

    const [first] = speakMock.mock.calls[0] as [SpeechSynthesisUtterance];
    first.onerror?.({} as SpeechSynthesisErrorEvent);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("stopSpeaking() cancels speech", () => {
    stopSpeaking();
    expect(cancelMock).toHaveBeenCalled();
  });

  it("does nothing without speechSynthesis", () => {
    vi.unstubAllGlobals();
    // jsdom has no speechSynthesis; make sure we don't throw either way.
    expect(() => {
      speak("Hello", "en");
      stopSpeaking();
    }).not.toThrow();
  });
});

describe("canSpeak", () => {
  it("reflects speechSynthesis support", () => {
    vi.stubGlobal("speechSynthesis", {});
    expect(canSpeak()).toBe(true);
  });
});
