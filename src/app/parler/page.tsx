import { SpeakCard } from "@/components/speak-card";

export default function ParlerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Parler</h1>
        <p className="text-sm text-foreground/55">
          Un mot t’est demandé : prononce-le. La reconnaissance vocale compare ce qu’elle a
          compris à la réponse attendue.
        </p>
      </div>
      <SpeakCard />
    </div>
  );
}
