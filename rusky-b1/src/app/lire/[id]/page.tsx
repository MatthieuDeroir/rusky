import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { currentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { textStateAction } from "@/app/actions";
import { Reader } from "@/components/reader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lecture" };

export default async function TextPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  const id = Number((await params).id);
  const text = Number.isInteger(id) ? await prisma.text.findUnique({ where: { id } }) : null;
  if (!text || (text.userId !== null && text.userId !== userId)) notFound();
  const [state, words] = await Promise.all([
    textStateAction(id),
    prisma.word.findMany({ where: { userId }, select: { entryId: true } }),
  ]);
  return (
    <div className="space-y-6">
      <Link href="/lire" className="inline-flex items-center gap-1 text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Lire
      </Link>
      <Reader textId={id} initial={state} collected={words.map((w) => w.entryId)} attribution={text.attribution} />
    </div>
  );
}
