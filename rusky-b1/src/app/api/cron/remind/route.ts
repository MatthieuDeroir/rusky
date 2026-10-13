import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { parisDay } from "@/lib/dates";
import { getProgress, lexiconCoverage, todayStatus } from "@/lib/learn";
import { weekReport } from "@/lib/motivation";
import { parisHour } from "@/lib/lessons";
import { sendToUser, pushConfigured, type PushPayload } from "@/lib/push";

// Rappels quotidiens, appelés par les tâches planifiées de Vercel (vercel.json). Chaque créneau
// est planifié deux fois (heure d'été / d'hiver) : seul l'appel qui tombe à la bonne heure de
// Paris envoie, et un rappel n'est jamais envoyé deux fois le même jour (PushLog).
const SLOTS = {
  morning: { hour: 7, lesson: "matin" },
  afternoon: { hour: 14, lesson: "apres-midi" },
  evening: { hour: 19, lesson: "soir" },
  night: { hour: 23, lesson: null },
  // Récapitulatif de la semaine, le dimanche soir.
  weekly: { hour: 20, lesson: null },
} as const;
type Slot = keyof typeof SLOTS;

function plural(n: number, one: string, many: string) {
  return `${n} ${n > 1 ? many : one}`;
}

function message(slot: Slot, st: Awaited<ReturnType<typeof todayStatus>>): PushPayload | null {
  const lessonId = SLOTS[slot].lesson;
  if (lessonId) {
    const l = st.lessons.find((x) => x.slot === lessonId)!;
    if (l.done) return null;
    const url = `/seance?lecon=${lessonId}`;
    switch (slot) {
      case "morning":
        return { title: "Доброе утро !", body: "La leçon du matin t’attend : révisions, un texte facile, 10 mots nouveaux.", url, tag: "rusky-morning" };
      case "afternoon":
        return { title: "Добрый день !", body: "C’est l’heure de la leçon de l’après-midi.", url, tag: "rusky-afternoon" };
      default:
        return { title: "Добрый вечер !", body: "Dernière leçon de la journée : celle du soir.", url, tag: "rusky-evening" };
    }
  }
  if (st.activeToday) return null;
  return {
    title: st.streak > 0 ? `Ne perds pas ta série de ${plural(st.streak, "jour", "jours")} ;)` : "Encore le temps avant minuit ;)",
    body: "Quelques révisions suffisent pour garder le rythme.",
    url: "/seance",
    tag: "rusky-night",
  };
}

/** Récapitulatif du dimanche : court et factuel. */
async function weeklyMessage(userId: string): Promise<PushPayload> {
  const [week, cov, p] = await Promise.all([weekReport(userId), lexiconCoverage(userId), getProgress(userId)]);
  const focus = cov.lexicons.find((l) => l.list === cov.focus);
  const parts = [
    `+${week.week} mots cette semaine (moyenne ${Math.round(week.average)})`,
    focus ? `lexique ${focus.code} : ${focus.known}/${focus.size}` : null,
    p.reading30 !== null ? `lecture ${Math.round(p.reading30 * 100)} %` : null,
    week.target
      ? `${week.target.code} prévu le ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(week.target.date + "T12:00:00Z"))}`
      : null,
  ].filter(Boolean);
  return {
    title: week.daysAhead > 0 ? `Semaine en avance de ${plural(week.daysAhead, "jour", "jours")}` : "Ta semaine en russe",
    body: `${parts.join(" · ")}.`,
    url: "/progres",
    tag: "rusky-weekly",
  };
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  const slot = req.nextUrl.searchParams.get("slot") as Slot | null;
  if (!slot || !(slot in SLOTS)) return NextResponse.json({ error: "créneau inconnu" }, { status: 400 });
  if (!pushConfigured()) return NextResponse.json({ error: "push non configuré" }, { status: 500 });
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!force && parisHour() !== SLOTS[slot].hour) return NextResponse.json({ skipped: "pas l’heure à Paris" });
  const parisWeekday = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short" }).format(new Date());
  if (!force && slot === "weekly" && parisWeekday !== "Sun") return NextResponse.json({ skipped: "pas dimanche à Paris" });

  const day = parisDay();
  const users = [...new Set((await prisma.pushSubscription.findMany({ select: { userId: true } })).map((s) => s.userId))];
  const results: Record<string, string> = {};
  for (const userId of users) {
    const payload = slot === "weekly" ? await weeklyMessage(userId) : message(slot, await todayStatus(userId));
    if (!payload) {
      results[userId] = "rien à rappeler";
      continue;
    }
    // Réserve le créneau AVANT d'envoyer : deux appels simultanés n'envoient pas deux fois.
    const claimed = await prisma.pushLog.create({ data: { userId, day, slot } }).then(() => true, () => false);
    if (!claimed && !force) {
      results[userId] = "déjà envoyé";
      continue;
    }
    results[userId] = `${await sendToUser(userId, payload)} appareil(s)`;
  }
  return NextResponse.json({ slot, day, results });
}
