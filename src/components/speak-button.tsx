"use client";

import { useSyncExternalStore } from "react";
import { Volume2 } from "lucide-react";
import { stripStress } from "@/lib/grammar";

// Client-only feature detection without a hydration mismatch (mirrors lib/speech.ts pattern).
function subscribe() {
  return () => {};
}
function hasSynthesis() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

const isRu = (v: SpeechSynthesisVoice) =>
  v.lang?.toLowerCase().replace("_", "-").startsWith("ru");

/** Speak Russian text, forcing a Russian voice. Voices load async, so wait for them if the
 * list is still empty on the first call. */
export function speakRussian(text: string) {
  const synth = window.speechSynthesis;
  const utter = () => {
    synth.cancel(); // stop any in-flight utterance so rapid taps don't queue up
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ru-RU";
    const ru = synth.getVoices().find(isRu);
    if (ru) u.voice = ru;
    u.rate = 0.95;
    synth.speak(u);
  };
  if (synth.getVoices().length === 0) {
    // Trigger/await population of the voice list, then speak with a Russian voice — but only
    // once, whether it's the event or the fallback timeout that fires first.
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      synth.removeEventListener("voiceschanged", go);
      utter();
    };
    synth.addEventListener("voiceschanged", go);
    synth.getVoices();
    setTimeout(go, 250);
  } else {
    utter();
  }
}

/** Speaks a Russian word/form aloud via the browser's speech synthesis (ru-RU). */
export function SpeakButton({
  text,
  className = "",
  title = "Écouter la prononciation",
}: {
  text: string;
  className?: string;
  title?: string;
}) {
  const supported = useSyncExternalStore(subscribe, hasSynthesis, () => false);
  if (!supported) return null;

  const clean = stripStress(text).trim(); // drop the dataset's "vowel + '" stress marks, keep ё
  if (!clean) return null;

  function speak(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    speakRussian(clean);
  }

  return (
    <button
      type="button"
      onClick={speak}
      onMouseDown={(e) => e.preventDefault()} // don't steal focus from an open input
      title={title}
      aria-label={title}
      className={`inline-flex shrink-0 items-center justify-center rounded-md text-foreground/40 transition-colors hover:text-primary ${className}`}
    >
      <Volume2 className="h-4 w-4" />
    </button>
  );
}
