// Persistence for validated grammatical levels — now in the DB (table LevelProgress),
// scoped per user. Previously a JSON file next to the DB; moved so it works on Vercel's
// read-only filesystem and is isolated per Google account.
import { prisma } from "@/lib/db";
import type { LevelTrack } from "./levels";

export type ValidatedLevels = Record<LevelTrack, number>; // highest validated index per track (-1 = none)

const TRACKS: LevelTrack[] = ["declension", "conjugation", "vocabulary"];
const EMPTY: ValidatedLevels = { declension: -1, conjugation: -1, vocabulary: -1 };

export async function getValidatedLevels(userId: string): Promise<ValidatedLevels> {
  const rows = await prisma.levelProgress.findMany({ where: { userId } });
  const out: ValidatedLevels = { ...EMPTY };
  for (const r of rows) {
    if ((TRACKS as string[]).includes(r.track)) {
      out[r.track as LevelTrack] = r.level;
    }
  }
  return out;
}

/** Record a newly validated level (monotonic — never lowers an already-validated level). */
export async function recordValidatedLevel(
  userId: string,
  track: LevelTrack,
  level: number,
): Promise<ValidatedLevels> {
  const existing = await prisma.levelProgress.findUnique({
    where: { userId_track: { userId, track } },
  });
  if (!existing) {
    await prisma.levelProgress.create({ data: { userId, track, level } });
  } else if (level > existing.level) {
    await prisma.levelProgress.update({
      where: { userId_track: { userId, track } },
      data: { level },
    });
  }
  return getValidatedLevels(userId);
}
