"use server";

// Actions des pages de maintenance /admin/quarantine et /admin/health (§B/§M du plan). Pas
// d'auth par rôle dédiée dans cette app (usage personnel, currentUserId() suffit pour l'auth de
// base) — ces pages restent accessibles à tout utilisateur connecté, comme le reste de l'app.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/auth";
import type { ValidationStep } from "@/lib/exam/validate";
import type { LexgramPayload } from "@/lib/exam/types";

export interface QuarantineEntry {
  id: number;
  typeId: string;
  targetId: string;
  stem: string;
  options: string[];
  validatedBy: ValidationStep[];
  createdAt: string;
}

export async function listQuarantinedAction(): Promise<QuarantineEntry[]> {
  await currentUserId();
  const rows = await prisma.trkiBankItem.findMany({
    where: { quarantined: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((r) => {
    const payload = JSON.parse(r.payload) as LexgramPayload;
    return {
      id: r.id,
      typeId: r.typeId,
      targetId: r.targetId,
      stem: payload.stem,
      options: payload.options.map((o) => o.text),
      validatedBy: JSON.parse(r.validatedBy) as ValidationStep[],
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function resolveQuarantineAction(id: number, keep: boolean): Promise<void> {
  await currentUserId();
  if (keep) {
    await prisma.trkiBankItem.update({ where: { id }, data: { quarantined: false } });
  } else {
    await prisma.trkiBankItem.delete({ where: { id } });
  }
  revalidatePath("/admin/quarantine");
}

export interface HealthStat {
  typeId: string;
  totalGenerated: number;
  quarantinedCount: number;
  rejectRateByPass: { pass: number; name: string; rejectRate: number }[];
}

export async function getValidationHealthAction(): Promise<HealthStat[]> {
  await currentUserId();
  const rows = await prisma.trkiBankItem.findMany({
    select: { typeId: true, quarantined: true, validatedBy: true },
  });

  const byType = new Map<string, { total: number; quarantined: number; passRejects: Map<string, { pass: number; count: number }> }>();
  for (const r of rows) {
    const acc = byType.get(r.typeId) ?? { total: 0, quarantined: 0, passRejects: new Map() };
    acc.total++;
    if (r.quarantined) acc.quarantined++;
    const steps = JSON.parse(r.validatedBy) as ValidationStep[];
    for (const s of steps) {
      if (!s.ok) {
        const cur = acc.passRejects.get(s.name) ?? { pass: s.pass, count: 0 };
        cur.count++;
        acc.passRejects.set(s.name, cur);
      }
    }
    byType.set(r.typeId, acc);
  }

  return [...byType.entries()].map(([typeId, acc]) => ({
    typeId,
    totalGenerated: acc.total,
    quarantinedCount: acc.quarantined,
    rejectRateByPass: [...acc.passRejects.entries()]
      .map(([name, { pass, count }]) => ({ pass, name, rejectRate: acc.total > 0 ? count / acc.total : 0 }))
      .sort((a, b) => a.pass - b.pass),
  }));
}
