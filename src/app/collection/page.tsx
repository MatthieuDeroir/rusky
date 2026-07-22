import Link from "next/link";
import { getCollection } from "@/lib/queries";
import { currentUserId } from "@/lib/auth";
import { CollectionView } from "@/components/collection-view";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ma collection · Русский" };

export default async function CollectionPage() {
  const userId = await currentUserId();
  const items = await getCollection(userId);

  if (items.length === 0) {
    return (
      <div className="glass-strong mx-auto mt-6 max-w-xl rounded-3xl p-8 text-center">
        <h1 className="font-display text-2xl">Ta collection est vide</h1>
        <p className="mt-3 text-foreground/65">
          Ajoute les mots que tu croises dans tes lectures : l’app détecte leur nature et la
          forme rencontrée, puis remplit la bonne case de leur tableau.
        </p>
        <Button render={<Link href="/add" />} nativeButton={false} size="lg" className="mt-6">
          Ajouter un premier mot
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Ma collection</h1>
          <p className="text-sm text-foreground/55">
            {items.length} mot{items.length > 1 ? "s" : ""} rencontré{items.length > 1 ? "s" : ""}
          </p>
        </div>
        <Button render={<Link href="/add" />} nativeButton={false}>
          + Ajouter
        </Button>
      </div>
      <CollectionView items={items} />
    </div>
  );
}
