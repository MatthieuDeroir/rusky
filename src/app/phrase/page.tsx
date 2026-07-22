import { PhraseCard } from "@/components/phrase-card";

export default function PhrasePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Construire une phrase</h1>
        <p className="text-sm text-foreground/55">
          Écris ta propre phrase en russe : l’app vérifie automatiquement l’emploi des cas.
        </p>
      </div>
      <PhraseCard />
    </div>
  );
}
