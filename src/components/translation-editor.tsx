"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setTranslationAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TranslationEditor({
  entryId,
  initialFr,
}: {
  entryId: number;
  initialFr: string | null;
}) {
  const [fr, setFr] = useState(initialFr);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialFr ?? "");
  const [isSaving, startSave] = useTransition();

  function save() {
    startSave(async () => {
      const res = await setTranslationAction(entryId, value);
      setFr(res.translationsFr);
      setEditing(false);
      toast.success("Traduction enregistrée.");
    });
  }

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="traduction française…"
          autoFocus
          className="h-9 max-w-xs border-white/15 bg-white/5"
        />
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving ? "…" : "Enregistrer"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setValue(fr ?? "");
          }}
        >
          Annuler
        </Button>
      </form>
    );
  }

  if (fr) {
    return (
      <p className="group/tr flex items-center gap-2 text-foreground/70">
        {fr}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-foreground/40 underline-offset-2 opacity-0 transition-opacity hover:text-foreground/70 hover:underline group-hover/tr:opacity-100"
        >
          modifier
        </button>
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-sm text-foreground/50 transition-colors hover:border-white/40 hover:text-foreground/80"
    >
      + Ajouter la traduction française
    </button>
  );
}
