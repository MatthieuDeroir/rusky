import "server-only";
import { prisma } from "@/lib/db";
import { getCollection } from "@/lib/queries";
import { getPassedTasks } from "@/lib/torfl-store";

export interface AchievementDef {
  id: string;
  titre: string;
  description: string;
  emoji: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "premier-mot", titre: "Первое слово", description: "Ajouter ton premier mot", emoji: "🌱" },
  { id: "mots-25", titre: "Vocabulaire", description: "25 mots dans ta collection", emoji: "📖" },
  { id: "mots-100", titre: "Lexique", description: "100 mots dans ta collection", emoji: "📚" },
  { id: "mots-300", titre: "Dictionnaire", description: "300 mots dans ta collection", emoji: "🗂️" },
  { id: "paradigme", titre: "Tableau complet", description: "Compléter tout le tableau d’un mot", emoji: "🧩" },
  { id: "streak-7", titre: "Une semaine", description: "7 jours d’affilée", emoji: "🔥" },
  { id: "streak-30", titre: "Un mois", description: "30 jours d’affilée", emoji: "🚀" },
  { id: "streak-100", titre: "Centurion", description: "100 jours d’affilée", emoji: "🏛️" },
  { id: "xp-500", titre: "Élan", description: "Cumuler 500 XP", emoji: "💫" },
  { id: "xp-2000", titre: "Érudition", description: "Cumuler 2 000 XP", emoji: "🌟" },
  { id: "torfl", titre: "ТРКИ", description: "Valider une épreuve TORFL", emoji: "🎓" },
];

export interface AchievementState extends AchievementDef {
  unlocked: boolean;
  unlockedAt?: Date;
}

/** Compute badges from the user's data, persist newly-unlocked ones, return the full state. */
export async function getAchievements(userId: string): Promise<AchievementState[]> {
  const [stats, collection, passed, unlockedRows] = await Promise.all([
    prisma.userStats.findUnique({ where: { userId } }),
    getCollection(userId),
    getPassedTasks(userId),
    prisma.achievement.findMany({ where: { userId } }),
  ]);
  const already = new Map(unlockedRows.map((r) => [r.achievementId, r.unlockedAt]));

  const words = collection.length;
  const anyComplete = collection.some((w) => w.total > 0 && w.discovered >= w.total);
  const totalXp = stats?.totalXp ?? 0;
  const longest = stats?.longestStreak ?? 0;

  const conditions: Record<string, boolean> = {
    "premier-mot": words >= 1,
    "mots-25": words >= 25,
    "mots-100": words >= 100,
    "mots-300": words >= 300,
    paradigme: anyComplete,
    "streak-7": longest >= 7,
    "streak-30": longest >= 30,
    "streak-100": longest >= 100,
    "xp-500": totalXp >= 500,
    "xp-2000": totalXp >= 2000,
    torfl: passed.size >= 1,
  };

  // Persist any newly satisfied badge.
  const toInsert = ACHIEVEMENTS.filter((a) => conditions[a.id] && !already.has(a.id));
  if (toInsert.length > 0) {
    await prisma.achievement.createMany({
      data: toInsert.map((a) => ({ userId, achievementId: a.id })),
    });
  }

  return ACHIEVEMENTS.map((a) => ({
    ...a,
    unlocked: conditions[a.id] || already.has(a.id),
    unlockedAt: already.get(a.id),
  }));
}
