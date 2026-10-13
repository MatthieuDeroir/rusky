/** Barre du lexique : connus (vert), en cours (ambre), à venir. */
export function LexiconBar({ known, learning, total }: { known: number; learning: number; total: number }) {
  const k = (known / total) * 100;
  const l = (learning / total) * 100;
  return (
    <div
      className="flex h-3 overflow-hidden rounded-full bg-[var(--cell-empty)]"
      role="img"
      aria-label={`${known} mots connus, ${learning} en cours, sur ${total}`}
    >
      <div className="bg-known" style={{ width: `${k}%` }} />
      <div className="bg-learning" style={{ width: `${l}%` }} />
    </div>
  );
}

/** La grille du lexique : une case par mot du B1, dans l'ordre d'apprentissage. */
export function LexiconGrid({ states }: { states: string }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(5px,1fr))] gap-[2px] sm:grid-cols-[repeat(auto-fill,minmax(8px,1fr))] sm:gap-[3px]" aria-hidden>
      {[...states].map((s, i) => (
        <span
          key={i}
          className={s === "2" ? "aspect-square rounded-[1.5px] bg-known" : s === "1" ? "aspect-square rounded-[1.5px] bg-learning" : "aspect-square rounded-[1.5px] bg-[var(--cell-empty)]"}
        />
      ))}
    </div>
  );
}
