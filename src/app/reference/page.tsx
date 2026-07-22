import { ExternalLink } from "lucide-react";

export const dynamic = "force-static";
export const metadata = { title: "Référence · Русский" };

interface Resource {
  ru: string;
  fr: string;
  desc: string;
  href: string;
  host: string;
}

const GROUPS: { title: string; items: Resource[] }[] = [
  {
    title: "Institutions officielles",
    items: [
      {
        ru: "Институт Пушкина",
        fr: "Institut d’État de la langue russe A. S. Pouchkine",
        desc: "L’institution de référence pour le russe langue étrangère : méthodes, ressources et centre de certification ТРКИ.",
        href: "https://www.pushkin.institute/",
        host: "pushkin.institute",
      },
      {
        ru: "Образование на русском",
        fr: "« Éducation en russe » — cours en ligne gratuits",
        desc: "Portail de cours gratuits de l’Institut Pouchkine, du niveau débutant à avancé, avec grammaire et exercices.",
        href: "https://pushkinonline.ru/",
        host: "pushkinonline.ru",
      },
    ],
  },
  {
    title: "Dictionnaires & corpus",
    items: [
      {
        ru: "Грамота.ру",
        fr: "Portail de référence de la langue russe",
        desc: "Dictionnaires normatifs, orthographe, accentuation et règles de grammaire — la référence en ligne pour le bon usage.",
        href: "http://gramota.ru/",
        host: "gramota.ru",
      },
      {
        ru: "Национальный корпус русского языка",
        fr: "Corpus national de la langue russe",
        desc: "Des millions d’exemples d’usage réel : idéal pour voir un mot ou une forme en contexte authentique.",
        href: "https://ruscorpora.ru/",
        host: "ruscorpora.ru",
      },
      {
        ru: "OpenRussian",
        fr: "Dictionnaire russe ↔ anglais",
        desc: "Dictionnaire ouvert avec déclinaisons, conjugaisons et accents — la source des données de cette application.",
        href: "https://en.openrussian.org/",
        host: "openrussian.org",
      },
    ],
  },
  {
    title: "Certification",
    items: [
      {
        ru: "ТРКИ / TORFL",
        fr: "Test officiel de russe langue étrangère",
        desc: "Le système d’État de certification (niveaux A1 à C2). Informations, structure des épreuves et centres d’examen.",
        href: "https://www.pushkin.institute/certificates/",
        host: "pushkin.institute",
      },
    ],
  },
];

export default function ReferencePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-3xl">Référence</h1>
        <p className="mt-1 text-sm text-foreground/55">
          Des ressources officielles et reconnues pour approfondir le russe, au-delà de ta
          collection.
        </p>
      </div>

      {GROUPS.map((g) => (
        <section key={g.title} className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/40">
            {g.title}
          </h2>
          <div className="grid grid-cols-1 gap-3">
            {g.items.map((r) => (
              <a
                key={r.href}
                href={r.href}
                target="_blank"
                rel="noreferrer"
                className="glass glass-lift group flex items-start justify-between gap-4 rounded-2xl p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-display text-xl">{r.ru}</span>
                    <span className="text-sm text-foreground/55">{r.fr}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-foreground/65">{r.desc}</p>
                  <p className="mt-2 text-xs text-foreground/40">{r.host}</p>
                </div>
                <ExternalLink className="mt-1 size-4 shrink-0 text-foreground/35 transition-colors group-hover:text-primary" />
              </a>
            ))}
          </div>
        </section>
      ))}

      <p className="text-center text-xs text-foreground/35">
        Les liens ouvrent des sites externes officiels ou reconnus.
      </p>
    </div>
  );
}
