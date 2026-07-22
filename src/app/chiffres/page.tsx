import { displayAccent } from "@/lib/grammar";
import {
  ONES_TO_HUNDRED,
  HUNDREDS,
  THOUSANDS,
  type NumberEntry,
} from "@/lib/numerals";
import { SpeakButton } from "@/components/speak-button";

function NumberCard({ entry }: { entry: NumberEntry }) {
  return (
    <div className="glass flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-xs font-medium text-foreground/45">
          {entry.n.toLocaleString("fr-FR")}
        </div>
        <div className="truncate text-lg">{displayAccent(entry.ru)}</div>
      </div>
      <SpeakButton text={entry.ru} className="size-8" />
    </div>
  );
}

function Section({
  title,
  hint,
  entries,
  cols,
}: {
  title: string;
  hint: string;
  entries: NumberEntry[];
  cols: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-foreground/60">
          {title}
        </h2>
        <span className="text-xs text-foreground/40">{hint}</span>
      </div>
      <div className={`grid gap-2 ${cols}`}>
        {entries.map((e) => (
          <NumberCard key={e.n} entry={e} />
        ))}
      </div>
    </section>
  );
}

export default function ChiffresPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Chiffres</h1>
        <p className="text-sm text-foreground/55">
          Les nombres russes avec leur prononciation. Touche 🔊 pour écouter.
        </p>
      </div>

      <Section
        title="1 à 100"
        hint="chaque nombre"
        entries={ONES_TO_HUNDRED}
        cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
      />
      <Section
        title="Centaines"
        hint="100 → 1000"
        entries={HUNDREDS}
        cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
      />
      <Section
        title="Milliers"
        hint="2000 → 10 000"
        entries={THOUSANDS}
        cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
      />
    </div>
  );
}
