// Ce que demande chaque niveau, d'après les programmes officiels du test (Institut Pouchkine,
// éd. Zlatoust : « Требования » ТЭУ, ТБУ, ТРКИ-1). Chaque niveau s'ajoute aux précédents.
const LEVELS: { code: string; name: string; words: string; items: [string, string][] }[] = [
  {
    code: "A1",
    name: "ТЭУ, élémentaire",
    words: "780 mots",
    items: [
      ["Cas", "les 6 cas dans leurs emplois de base : sujet (nominatif), COD et direction в/на (accusatif), possession, absence avec нет, quantité, из/с (génitif), destinataire, âge, нравиться, нужно (datif), avec с, métier (instrumental), lieu в/на et о (prépositionnel)"],
      ["Verbes", "infinitif, présent, passé, futur ; 1re et 2e conjugaisons ; paires d’aspect (делать/сделать) ; impératif des verbes courants ; rection (смотреть что, разговаривать с кем)"],
      ["Mouvement", "идти/ходить, ехать/ездить, et пойти, прийти (préfixes по-, при-)"],
      ["Nombres", "cardinaux avec un nom (два года, пять лет) ; ordinaux au nominatif"],
      ["Pronoms", "personnels, possessifs, démonstratifs, interrogatifs, каждый, négatifs (никто, ничто)"],
      ["Phrases", "simples ; и, а, но, или ; subordonnées avec что, где, когда, потому что ; discours indirect simple"],
    ],
  },
  {
    code: "A2",
    name: "ТБУ, basique",
    words: "1 300 mots",
    items: [
      ["Adjectifs", "déclinaison complète et accord avec le nom (genre, nombre, cas) ; formes courtes courantes (рад, готов, занят, должен, болен) ; quelques comparatifs"],
      ["Verbes", "les 17 classes de conjugaison (читать — читаю … есть — едят) ; transitifs et intransitifs (встретить брата / встретиться с братом) ; verbes en -ся"],
      ["Mouvement", "идти/ходить, ехать/ездить, лететь/летать, нести/носить, везти/возить, avec по-, при-, у-, вы-, в-"],
      ["Nombres", "ordinaux déclinés (первого мая)"],
      ["Phrases", "subordonnées avec чтобы, ли, который, если, поэтому ; не только…, но и…"],
    ],
  },
  {
    code: "B1",
    name: "ТРКИ-1",
    words: "2 276 mots",
    items: [
      ["Cas", "tous les emplois : date (первого мая 2003 года), comparaison (старше брата), по + jours (по субботам), благодаря, durée (неделю), через, несмотря на, instrumental avec быть/стать/работать, заниматься, интересоваться, agent du passif (основан Петром), при"],
      ["Adjectifs", "formes courtes (красив, популярна) ; comparatif et superlatif (умнее, самый умный, умнейший ; лучше, хуже)"],
      ["Verbes", "emplois des aspects ; conditionnel avec бы ; impératif ; rection"],
      ["Mouvement", "préfixes в-, вы-, у-, по-, при-, пере-, про-, о-, за-, подо-, до-, от-"],
      ["Participes", "actifs et passifs (formation, reconnaissance) ; passifs courts (магазин закрыт, книга написана)"],
      ["Gérondifs", "imperfectifs et perfectifs (читая, прочитав)"],
      ["Nombres", "collectifs (двое, трое) ; déclinaison des cardinaux, en partie"],
      ["Pronoms et adverbes", "сам, самый, любой, ничей, себя ; где-то, где-нибудь, нигде ; comparatif des adverbes (дороже, лучше всего)"],
      ["Particules", "ведь, же, ли, неужели, разве"],
      ["Phrases", "пока (не), после того как, перед тем как, до того как ; если бы ; так как ; для того чтобы ; хотя, несмотря на то что ; relatives avec где, куда, откуда, когда"],
      ["Formation des mots", "suffixes -тель, -ник/-ница, -ость, -ние, -ство ; préfixes verbaux на-, пере-, по-, про-, о-"],
    ],
  },
];

/** Exigences de chaque niveau ; le prochain niveau à atteindre est déplié. */
export function LevelRequirements({ next }: { next: string | null }) {
  return (
    <div className="space-y-2">
      {LEVELS.map((l) => (
        <details
          key={l.code}
          open={l.code === next}
          className="group rounded-2xl bg-surface shadow-[inset_0_0_0_1px_var(--line)]"
        >
          <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="font-semibold text-cobalt">{l.code}</span> <span className="text-muted">{l.name}</span>
            </span>
            <span className="text-[15px] text-muted tabular-nums">{l.words}</span>
          </summary>
          <dl className="space-y-2 px-4 pb-4">
            {l.items.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[14px] font-semibold">{k}</dt>
                <dd className="text-[15px] text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
      <p className="text-[14px] text-faint">
        Chaque niveau s’ajoute aux précédents. À l’examen, il faut au moins 66 % à chacune des 5 épreuves : lexique et
        grammaire, lecture, écoute, écrit, oral.
      </p>
    </div>
  );
}
