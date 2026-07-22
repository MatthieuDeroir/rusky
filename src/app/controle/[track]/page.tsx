import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { LevelTest } from "@/components/level-test";
import { VocabTest } from "@/components/vocab-test";
import { TRACK_LABEL, type LevelTrack } from "@/lib/levels";

export const dynamic = "force-dynamic";

const TRACKS: LevelTrack[] = ["declension", "conjugation", "vocabulary"];

export default async function ControlePage({
  params,
}: {
  params: Promise<{ track: string }>;
}) {
  const { track } = await params;
  if (!TRACKS.includes(track as LevelTrack)) notFound();
  const t = track as LevelTrack;

  return (
    <div className="space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-semibold">Contrôle · {TRACK_LABEL[t]}</h1>
        <p className="text-sm text-foreground/55">
          Réussis ce contrôle pour valider le palier et obtenir le titre.
        </p>
      </div>
      {t === "vocabulary" ? <VocabTest /> : <LevelTest track={t} />}
    </div>
  );
}
