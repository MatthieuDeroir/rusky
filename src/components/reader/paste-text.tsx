"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTextAction } from "@/app/lire/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_CHARS = 6000;

export function PasteText() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const tooLong = body.length > MAX_CHARS;

  const submit = () =>
    start(async () => {
      try {
        const { id } = await createTextAction({ title, body });
        router.push(`/lire/${id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Impossible d’ajouter ce texte");
      }
    });

  return (
    <form
      className="glass-strong space-y-3 rounded-3xl p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className="font-display text-xl">Coller un texte</h2>
      <p className="text-sm text-foreground/55">
        Un article, une page de livre, des sous-titres, un message… L’app analyse chaque phrase : qui fait quoi,
        pourquoi chaque mot a cette terminaison.
      </p>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre (facultatif)"
        className="border-white/15 bg-white/5"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Вставьте сюда текст на русском…"
        rows={7}
        spellCheck={false}
        className="w-full resize-y rounded-xl border border-white/15 bg-white/5 px-3 py-2 font-display text-lg leading-relaxed outline-none placeholder:text-foreground/30 focus:border-primary/50"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs ${tooLong ? "text-red-300" : "text-foreground/40"}`}>
          {body.length}/{MAX_CHARS}
        </span>
        <Button type="submit" disabled={pending || !body.trim() || tooLong}>
          {pending ? "Envoi…" : "Lire ce texte"}
        </Button>
      </div>
    </form>
  );
}
