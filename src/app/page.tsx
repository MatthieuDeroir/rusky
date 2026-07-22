import Link from "next/link";
import { getCollection } from "@/lib/queries";
import { CollectionView } from "@/components/collection-view";
import { Milestones } from "@/components/milestones";
import { CompletionProgress } from "@/components/completion-progress";
import { getValidatedLevels } from "@/lib/level-store";
import { currentUserId } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const DECLINING = new Set(["noun", "adjective", "pronoun", "numeral"]);

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await currentUserId();
  const items = await getCollection(userId);
  // Split paradigm completion into declension (noun-like) vs conjugation (verb) families.
  const decl = { filled: 0, total: 0 };
  const conj = { filled: 0, total: 0 };
  for (const i of items) {
    if (i.type === "verb") {
      conj.filled += i.discovered;
      conj.total += i.total;
    } else if (DECLINING.has(i.type)) {
      decl.filled += i.discovered;
      decl.total += i.total;
    }
  }
  const validated = await getValidatedLevels(userId);

  if (items.length === 0) {
    return (
      <div className="glass-strong mx-auto mt-10 max-w-xl rounded-3xl p-10 text-center">
        <h1 className="text-2xl font-semibold">Ta collection est vide</h1>
        <p className="mt-3 text-foreground/65">
          Ajoute les mots que tu croises dans tes lectures. L’app détecte leur nature et la
          forme rencontrée, puis remplit la bonne case de leur tableau — à toi de compléter le
          reste.
        </p>
        <Button render={<Link href="/add" />} nativeButton={false} size="lg" className="mt-6">
          Ajouter un premier mot
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mes mots</h1>
          <p className="text-sm text-foreground/55">
            {items.length} mot{items.length > 1 ? "s" : ""} dans ta collection
          </p>
        </div>
        <Button render={<Link href="/add" />} nativeButton={false}>
          + Ajouter
        </Button>
      </div>

      <Milestones count={items.length} validatedLevel={validated.vocabulary} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CompletionProgress
          track="declension"
          filled={decl.filled}
          totalCells={decl.total}
          validatedLevel={validated.declension}
        />
        <CompletionProgress
          track="conjugation"
          filled={conj.filled}
          totalCells={conj.total}
          validatedLevel={validated.conjugation}
        />
      </div>

      <CollectionView items={items} />
    </div>
  );
}
