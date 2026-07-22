"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RADIO_STATIONS, type RadioStation } from "@/lib/radio";

export type RadioState = "idle" | "loading" | "playing" | "error";

interface RadioCtx {
  stationId: string;
  station: RadioStation;
  state: RadioState;
  play: (id: string) => void;
  toggle: () => void;
  stop: () => void;
}

const Ctx = createContext<RadioCtx | null>(null);

export function useRadio(): RadioCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRadio must be used within <RadioProvider>");
  return c;
}

/**
 * Holds the single <audio> element for the whole app. Because the provider is mounted in the
 * layout chrome (not a page), playback survives navigation — the mini-player lets you pause it
 * from anywhere, Citoyen-style.
 */
export function RadioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [stationId, setStationId] = useState(RADIO_STATIONS[0].id);
  const [state, setState] = useState<RadioState>("idle");
  const station = RADIO_STATIONS.find((s) => s.id === stationId) ?? RADIO_STATIONS[0];

  const play = useCallback((id: string) => {
    const el = audioRef.current;
    if (!el) return;
    const s = RADIO_STATIONS.find((x) => x.id === id) ?? RADIO_STATIONS[0];
    setStationId(id);
    setState("loading");
    el.src = s.url;
    el.play().catch(() => setState("error"));
  }, []);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (state === "playing" || state === "loading") {
      el.pause();
      setState("idle");
    } else {
      play(stationId);
    }
  }, [state, stationId, play]);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    setState("idle");
  }, []);

  return (
    <Ctx.Provider value={{ stationId, station, state, play, toggle, stop }}>
      {children}
      <audio
        ref={audioRef}
        preload="none"
        onPlaying={() => setState("playing")}
        onWaiting={() => setState("loading")}
        onError={() => setState("error")}
      />
    </Ctx.Provider>
  );
}
