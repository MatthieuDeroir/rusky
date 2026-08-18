import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { LearnDrill } from "@/components/learn-drill";
import { findScope } from "@/lib/learn";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  const s = findScope(scope);
  return { title: `${s?.label ?? "Apprendre"} · Русский` };
}

export default async function ApprendreScopePage({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  const s = findScope(scope);
  if (!s) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-semibold">{s.label}</h1>
        <p className="text-sm text-foreground/55">{s.blurb}</p>
      </div>
      <LearnDrill scopeKey={s.key} mode={s.mode} />
    </div>
  );
}
