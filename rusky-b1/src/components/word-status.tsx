"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { setWordStatusAction } from "@/app/actions";
import { cn } from "@/lib/utils";

/** Deux boutons pour déclarer un mot connu / à apprendre. Mise à jour immédiate à l'écran,
 * enregistrée en arrière-plan ; en cas d'échec, l'état revient en arrière avec un message. */
export function WordStatus({ entryId, status, size = "sm" }: { entryId: number; status: string | null; size?: "sm" | "md" }) {
  const [current, setCurrent] = useState(status);
  const [pending, start] = useTransition();

  const set = (known: boolean) => {
    const target = known ? "KNOWN" : "LEARNING";
    if (current === target) return;
    const before = current;
    setCurrent(target);
    start(async () => {
      try {
        await setWordStatusAction(entryId, known);
      } catch {
        setCurrent(before);
        toast.error("Non enregistré. Vérifie ta connexion et réessaie.");
      }
    });
  };

  const base = size === "md" ? "h-10 px-3 text-[15px] gap-1.5" : "size-9 justify-center";
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => set(true)}
        aria-pressed={current === "KNOWN"}
        aria-label="Je connais ce mot"
        title="Je connais ce mot"
        className={cn(
          "inline-flex items-center rounded-lg transition-colors",
          base,
          current === "KNOWN" ? "bg-known text-white dark:text-[#06150d]" : "bg-surface text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-known",
        )}
      >
        {pending && current === "KNOWN" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {size === "md" && "Je connais"}
      </button>
      <button
        type="button"
        onClick={() => set(false)}
        aria-pressed={current === "LEARNING"}
        aria-label="À apprendre"
        title="À apprendre"
        className={cn(
          "inline-flex items-center rounded-lg transition-colors",
          base,
          current === "LEARNING" ? "bg-learning text-white dark:text-[#1d1403]" : "bg-surface text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-learning",
        )}
      >
        {pending && current === "LEARNING" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        {size === "md" && "À apprendre"}
      </button>
    </div>
  );
}
