import Link from "next/link";
import { notFound } from "next/navigation";
import { findUnit } from "@/lib/reader/curriculum";
import { UnitView } from "@/components/reader/unit-view";

export const dynamic = "force-dynamic";

export default async function UnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = findUnit(unitId);
  if (!unit) notFound();
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Link href="/seance" className="text-sm text-foreground/50 hover:text-foreground/80">
          ← Les 12 structures
        </Link>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">Unité {unit.n} / 12</p>
        <h1 className="font-display text-3xl leading-tight">{unit.title}</h1>
        <p className="text-sm text-foreground/60">{unit.goal}</p>
      </div>
      <UnitView unit={unit} />
    </div>
  );
}
