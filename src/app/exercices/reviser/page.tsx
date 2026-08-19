import { BackButton } from "@/components/back-button";
import { PracticeCard } from "@/components/practice-card";
import { getThemeOptions } from "@/lib/queries";
import { currentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Réviser · Русский" };

export default async function ReviserPage() {
  const userId = await currentUserId();
  const themes = await getThemeOptions(userId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-semibold">Réviser</h1>
        <p className="text-sm text-foreground/55">
          Rappels espacés et nouvelles formes à découvrir, mélangés dans une seule file.
        </p>
      </div>
      <PracticeCard themes={themes} />
    </div>
  );
}
