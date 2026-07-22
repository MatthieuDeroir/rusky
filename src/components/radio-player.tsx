"use client";

import { Play, Pause, Radio, Loader2 } from "lucide-react";
import { RADIO_STATIONS } from "@/lib/radio";
import { useRadio } from "@/components/radio/radio-provider";

// Home radio card — station picker + play/pause, driven by the shared RadioProvider so playback
// keeps going as you move around the app (pause it here or from the mini-player anywhere).
export function RadioPlayer() {
  const { state, stationId, station, play, toggle } = useRadio();

  return (
    <section className="glass rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={state === "playing" ? "Mettre en pause" : "Écouter la radio"}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform active:scale-95"
        >
          {state === "loading" ? (
            <Loader2 className="size-5 animate-spin" />
          ) : state === "playing" ? (
            <Pause className="size-5" />
          ) : (
            <Play className="size-5 translate-x-0.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Radio className="size-3.5 text-primary" />
            Radio russe en direct
          </div>
          <p className="truncate text-xs text-foreground/50">
            {state === "error" ? "Flux indisponible — essaie une autre station" : station.title}
          </p>
        </div>

        {state === "playing" && (
          <span className="flex items-end gap-0.5" aria-hidden>
            <span className="h-3 w-0.5 animate-pulse rounded bg-primary [animation-delay:-0.2s]" />
            <span className="h-4 w-0.5 animate-pulse rounded bg-primary" />
            <span className="h-2.5 w-0.5 animate-pulse rounded bg-primary [animation-delay:-0.4s]" />
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {RADIO_STATIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => play(s.id)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
              s.id === stationId
                ? "bg-primary/20 text-foreground ring-primary/40"
                : "bg-white/5 text-foreground/60 ring-transparent hover:bg-white/10"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </section>
  );
}
