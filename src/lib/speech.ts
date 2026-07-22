// Thin wrapper over the browser Web Speech API (speech-to-text). Client-only; not in the
// standard DOM lib, so we declare the minimal shape we use.
export interface SpeechResultAlt {
  transcript: string;
}
export interface SpeechResult {
  readonly length: number;
  isFinal: boolean;
  [i: number]: SpeechResultAlt;
}
export interface SpeechEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResult };
}
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
export type RecognitionCtor = new () => Recognition;

export function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Stable no-op subscribe for useSyncExternalStore-based feature detection. */
export const noopSubscribe = () => () => {};
