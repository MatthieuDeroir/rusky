import Link from "next/link";
import { Flame, Snowflake, Star, Trophy, LogOut, BookOpen, Hash, GraduationCap, Award, ArrowRight } from "lucide-react";
import { currentUserId, signOut, devBypass } from "@/lib/auth";
import { getGameStats } from "@/lib/xp";
import { getMasteryOverview, getProgressTimeline } from "@/lib/queries";
import { getLevel } from "@/lib/game-levels";
import { getAchievements } from "@/lib/achievements";
import { ProgressRing } from "@/components/progress-ring";
import { GoalEditor } from "@/components/goal-editor";
import { MasteryBar } from "@/components/mastery-bar";
import { ProgressSparkline } from "@/components/progress-timeline";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil · Русский" };

export default async function ProfilPage() {
  const userId = await currentUserId();
  const [stats, badges, mastery, timeline] = await Promise.all([
    getGameStats(userId),
    getAchievements(userId),
    getMasteryOverview(userId),
    getProgressTimeline(userId),
  ]);
  const level = getLevel(stats.totalXp);
  const unlocked = badges.filter((b) => b.unlocked).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Profil</h1>

      {/* Level + today's goal */}
      <section className="glass-strong rounded-3xl p-6">
        <div className="flex items-center gap-2">
          <Star className="size-5 fill-primary text-primary" />
          <h2 className="font-display text-xl">{level.title}</h2>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-700"
            style={{ width: `${Math.round(level.progress * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-foreground/50">
          {level.next
            ? `${stats.totalXp} XP — plus que ${level.next - stats.totalXp} pour le niveau suivant`
            : `${stats.totalXp} XP — niveau max 🎉`}
        </p>

        <div className="mt-5 flex items-center gap-4">
          <ProgressRing value={Math.min(stats.todayXp, stats.goal)} total={stats.goal} size={56} />
          <div className="flex-1">
            <GoalEditor goal={stats.goal} />
          </div>
        </div>
      </section>

      {/* Streak stats */}
      <section className="grid grid-cols-3 gap-3">
        <Stat icon={<Flame className="size-5 text-primary" />} label="Série" value={stats.currentStreak} />
        <Stat icon={<Trophy className="size-5 text-primary" />} label="Record" value={stats.longestStreak} />
        <Stat icon={<Snowflake className="size-5 text-sky-300" />} label="Gels" value={stats.streakFreezes} />
      </section>

      {/* Progression dans le temps */}
      {timeline.length > 1 && (
        <section className="space-y-3">
          <h2 className="font-medium">Progression</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ProgressSparkline title="Mots connus" points={timeline} metric="words" />
            <ProgressSparkline title="Formes découvertes" points={timeline} metric="forms" />
            <ProgressSparkline title="Verbes connus" points={timeline} metric="verbs" />
            <ProgressSparkline title="Conjugaisons maîtrisées" points={timeline} metric="conjugations" />
            <ProgressSparkline
              title="Points de maîtrise (XP)"
              points={timeline}
              metric="xp"
              suffix=" XP"
            />
          </div>
        </section>
      )}

      {/* Maîtrise globale */}
      <section className="glass rounded-3xl p-6 space-y-5">
        <h2 className="font-medium">Maîtrise globale</h2>
        <div className="space-y-3">
          <MasteryBar label="Mots (russe → français)" stat={mastery.words} />
          <MasteryBar label="Verbes" stat={mastery.verbs} />
          <MasteryBar label="Adjectifs" stat={mastery.adjectives} />
          <MasteryBar label="Déclinaison (ensemble)" stat={mastery.declension} unit="case" />
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/45">
            Déclinaison par cas
          </h3>
          <div className="space-y-2.5">
            {mastery.byCase.map((c) => (
              <MasteryBar key={c.code} label={c.label} stat={{ avg: c.avg, count: c.count }} unit="case" />
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/45">
            Traduction
          </h3>
          <div className="space-y-2.5">
            <MasteryBar label="Russe → Français" stat={mastery.translateRuFr} />
            <MasteryBar label="Français → Russe" stat={mastery.translateFrRu} />
          </div>
        </div>
      </section>

      {/* Badges */}
      <section className="glass rounded-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium">Badges</h2>
          <span className="text-sm text-foreground/50">
            {unlocked}/{badges.length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {badges.map((b) => (
            <div
              key={b.id}
              className={`flex items-center gap-3 rounded-2xl p-3 ring-1 transition-colors ${
                b.unlocked
                  ? "bg-primary/10 ring-primary/25"
                  : "bg-white/[0.03] ring-white/10 opacity-55"
              }`}
              title={b.description}
            >
              <span className={`text-2xl ${b.unlocked ? "" : "grayscale"}`}>{b.emoji}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{b.titre}</p>
                <p className="truncate text-xs text-foreground/50">{b.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Ressources : consultation et validation, en dehors de la boucle d'entraînement */}
      <section className="glass rounded-3xl p-6">
        <h2 className="mb-4 font-medium">Ressources</h2>
        <div className="grid grid-cols-2 gap-2">
          <ResourceLink href="/reference" icon={<BookOpen className="size-4" />} label="Référence" />
          <ResourceLink href="/cas" icon={<Award className="size-4" />} label="Cas" />
          <ResourceLink href="/chiffres" icon={<Hash className="size-4" />} label="Chiffres" />
          <ResourceLink href="/validation" icon={<GraduationCap className="size-4" />} label="Validation TORFL" />
        </div>
      </section>

      {!devBypass && (
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-foreground/70 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <LogOut className="size-4" />
            Se déconnecter
          </button>
        </form>
      )}
    </div>
  );
}

function ResourceLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3.5 py-2.5 text-sm ring-1 ring-white/10 transition-colors hover:bg-white/10"
    >
      <span className="flex items-center gap-2 text-foreground/80">
        {icon}
        {label}
      </span>
      <ArrowRight className="size-3.5 text-foreground/35" />
    </Link>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="glass flex flex-col items-center gap-1 rounded-2xl py-4">
      {icon}
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-foreground/50">{label}</span>
    </div>
  );
}
