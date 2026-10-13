import type { Role } from "@/lib/reader/types";

// Couleurs du mode structure — une teinte par fonction, lisibles sur le fond encre. Le verbe
// prend l'or de la DA (c'est le pivot de la phrase).
export const ROLE_TEXT: Record<Role, string> = {
  subject: "text-sky-300",
  verb: "text-primary",
  object: "text-rose-300",
  indirect: "text-emerald-300",
  complement: "text-violet-300",
  preposition: "text-violet-300/70",
  conjunction: "text-foreground/45",
  other: "text-foreground/70",
};

export const ROLE_UNDERLINE: Record<Role, string> = {
  subject: "decoration-sky-300/70",
  verb: "decoration-primary/80",
  object: "decoration-rose-300/70",
  indirect: "decoration-emerald-300/70",
  complement: "decoration-violet-300/60",
  preposition: "decoration-transparent",
  conjunction: "decoration-transparent",
  other: "decoration-transparent",
};

export const ROLE_CHIP: Record<Role, string> = {
  subject: "bg-sky-400/15 text-sky-200 ring-sky-300/30",
  verb: "bg-primary/15 text-primary ring-primary/30",
  object: "bg-rose-400/15 text-rose-200 ring-rose-300/30",
  indirect: "bg-emerald-400/15 text-emerald-200 ring-emerald-300/30",
  complement: "bg-violet-400/15 text-violet-200 ring-violet-300/30",
  preposition: "bg-violet-400/10 text-violet-200/80 ring-violet-300/20",
  conjunction: "bg-white/5 text-foreground/60 ring-white/10",
  other: "bg-white/5 text-foreground/60 ring-white/10",
};

/** Rôles montrés dans la légende (les autres sont discrets). */
export const LEGEND_ROLES: Role[] = ["subject", "verb", "object", "indirect", "complement"];
