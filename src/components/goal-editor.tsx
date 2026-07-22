"use client";

import { useState, useTransition } from "react";
import { setDailyGoalAction } from "@/app/actions";

const PRESETS = [20, 50, 80, 120];

// Daily XP goal picker (profile). Optimistic, persists via the server action.
export function GoalEditor({ goal }: { goal: number }) {
  const [current, setCurrent] = useState(goal);
  const [pending, start] = useTransition();

  function choose(g: number) {
    if (g === current) return;
    setCurrent(g);
    start(async () => {
      const { goal: saved } = await setDailyGoalAction(g);
      setCurrent(saved);
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Objectif quotidien</span>
        <span className="text-sm tabular-nums text-primary">{current} XP{pending ? " …" : ""}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => choose(g)}
            disabled={pending}
            className={`rounded-xl px-3.5 py-2 text-sm font-medium ring-1 transition-colors ${
              g === current
                ? "bg-primary/25 text-foreground ring-primary/40"
                : "bg-white/5 text-foreground/65 ring-transparent hover:bg-white/10"
            }`}
          >
            {g} XP
          </button>
        ))}
      </div>
    </div>
  );
}
