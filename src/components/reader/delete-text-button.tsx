"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteTextAction } from "@/app/lire/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function DeleteTextButton({ id, title }: { id: number; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Supprimer ce texte"
        className="rounded-full p-2 text-foreground/35 hover:bg-white/10 hover:text-red-300"
      >
        <Trash2 className="size-4" />
      </button>
      <ConfirmDialog
        open={open}
        title="Supprimer ce texte ?"
        description={`« ${title} » et ses réponses seront supprimés. Les mots que tu as gardés restent dans ta collection.`}
        confirmLabel="Supprimer"
        destructive
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          start(async () => {
            await deleteTextAction(id);
            setOpen(false);
            router.refresh();
          })
        }
      />
    </>
  );
}
