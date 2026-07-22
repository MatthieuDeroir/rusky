"use client";

import { Pause, Play, Radio, X, Loader2 } from "lucide-react";
import { useRadio } from "@/components/radio/radio-provider";

// Small persistent control shown across pages while the radio is active. Sits above the mobile
// bottom-nav, bottom-right on desktop.
export function MiniPlayer() {
  const { state, station, toggle, stop } = useRadio();
  if (state === "idle") return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:justify-end">
      <div className="glass-strong flex items-center gap-2.5 rounded-full py-1.5 pl-2.5 pr-1.5 shadow-lg">
        <button
          type="button"
          onClick={toggle}
          aria-label={state === "playing" ? "Mettre en pause" : "Reprendre"}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
        >
          {state === "loading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : state === "playing" ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4 translate-x-px" />
          )}
        </button>

        <div className="flex min-w-0 items-center gap-1.5 pr-1 text-sm">
          <Radio className="size-3.5 shrink-0 text-primary" />
          <span className="max-w-[9rem] truncate">
            {state === "error" ? "Flux indisponible" : station.label}
          </span>
        </div>

        <button
          type="button"
          onClick={stop}
          aria-label="Arrêter la radio"
          className="grid size-7 shrink-0 place-items-center rounded-full text-foreground/45 transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
