"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { pasteTextAction } from "@/app/actions";
import { Button } from "@/components/ui";

export function PasteText() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const { id } = await pasteTextAction({ title: "", body });
            router.push(`/lire/${id}`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Le texte n’a pas pu être ajouté.");
          }
        });
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        lang="ru"
        placeholder="Un article, un passage de livre, des paroles… en russe."
        className="ru w-full rounded-xl bg-surface p-4 text-[18px] shadow-[inset_0_0_0_1px_var(--line)] outline-none placeholder:font-sans placeholder:text-[16px] placeholder:text-faint focus:shadow-[inset_0_0_0_2px_var(--cobalt)]"
      />
      <Button type="submit" variant="secondary" disabled={pending || !body.trim()}>
        {pending ? "Ajout…" : "Analyser ce texte"}
      </Button>
    </form>
  );
}
