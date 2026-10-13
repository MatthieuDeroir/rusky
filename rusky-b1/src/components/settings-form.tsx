"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSettingsAction } from "@/app/actions";
import { Button } from "@/components/ui";

export function SettingsForm({ examDate }: { examDate: string | null }) {
  const [date, setDate] = useState(examDate ?? "");
  const [pending, start] = useTransition();
  const dirty = date !== (examDate ?? "");
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await saveSettingsAction({ examDate: date || null });
          toast.success("Réglages enregistrés");
        });
      }}
    >
      <label className="space-y-1">
        <span className="block text-[14px] text-muted">Date de l’examen</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 rounded-xl bg-surface px-3 shadow-[inset_0_0_0_1px_var(--line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--cobalt)]"
        />
      </label>
      <Button type="submit" variant="secondary" disabled={!dirty || pending}>
        Enregistrer
      </Button>
    </form>
  );
}
