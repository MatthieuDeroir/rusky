"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { newDailyTextAction, newPracticeTextAction } from "@/app/actions";
import { Button } from "@/components/ui";

/** Deux façons de générer un texte : entraînement avec les seuls mots connus, ou à son niveau. */
export function GenerateText() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (practice: boolean) =>
    start(async () => {
      try {
        const { id } = await (practice ? newPracticeTextAction() : newDailyTextAction());
        router.push(`/lire/${id}`);
      } catch {
        toast.error("Le texte n’a pas pu être lancé. Réessaie.");
      }
    });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-[inset_0_0_0_1px_var(--line)]">
        <Button onClick={() => go(true)} disabled={pending} className="w-full">
          Avec mes mots seulement
        </Button>
        <p className="text-[14px] text-muted">
          Un texte court écrit uniquement avec les mots que tu connais : pour lire vite et sans aide.
        </p>
      </div>
      <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-[inset_0_0_0_1px_var(--line)]">
        <Button variant="secondary" onClick={() => go(false)} disabled={pending} className="w-full">
          À mon niveau
        </Button>
        <p className="text-[14px] text-muted">Comme le texte du jour : tes mots, plus quelques mots nouveaux du parcours.</p>
      </div>
    </div>
  );
}
