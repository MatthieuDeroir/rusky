# Progression — Module Objectif B1 / Examen blanc ТРКИ-1

Une ligne par session de travail, jamais réécrite rétroactivement. Voir le plan complet à
`/home/mderoir/.claude/plans/robust-yawning-plum.md`.

## 2026-08-24

- Plan complet M1→M6 approuvé (hub `/objectif-b1`, KPI exhaustifs, carnet d'erreurs, IA de
  recommandation, parcours vocabulaire quotidien).
- Schéma Prisma posé (`Trki*`, `B1VocabDay`, `DictionaryEntry.inB1Minimum`,
  `UserStats.b1TargetDate`), migré en local **et sur Turso (production)**, backup pris avant
  chaque migration (`prisma/backups/`).
- Lexique minimum B1 obtenu (`data/B1/lexique_b1.json`, 2524 entrées, extraites par
  l'utilisateur) et importé — 2319/2506 lemmes matchés, en local et sur Turso.
- Moteur `lexgram` prouvé de bout en bout sur `case-government-verb` : blueprint, génération
  Mistral (few-shot inline), validation 6 passes, banque d'items, scoring déterministe. Smoke test
  réel contre Turso confirme que les 6 passes fonctionnent (rejets légitimes observés : mot hors
  allowlist, options dupliquées par syncrétisme casuel).
- Hub `/objectif-b1` (dashboard minimal), `/objectif-b1/examens` (création/liste/polling),
  passation + matrice de réponses, résultats, `/admin/quarantine`, `/admin/health`. Nav mise à
  jour (desktop + mobile).
- **Correctif barème** : les `maxPoints`/seuils d'origine (spec §2) étaient partiellement
  inventés — remplacés par le barème officiel (Типовые тесты, Zlatoust), `isPassed()` réécrit en
  deux conditions cumulatives sur des scores bruts. Vérifié par `scripts/verify-trki-passing.ts`
  (tous cas passent, y compris la documentation de l'incohérence 445 < 446 sur les seuils
  individuels). Phasage M2-M6 réordonné (говорение remonté juste après M1).
- `tsc --noEmit`, `npm run build`, `npm run lint` : propres.

## 2026-08-24 (suite)

- Premier `TrkiPaper` réel créé en prod par l'utilisateur : échec (10/19 items). Diagnostiqué
  directement sur Turso (`TrkiBankItem.validatedBy`) : rejets massifs passe 4 (lexique, tolérance
  zéro trop stricte) + rate limit Mistral 429 pendant les retries. Corrigé (tolérance 1 mot +
  partenaire aspectuel, backoff 429, concurrence 4→2) et revérifié en prod avant push — voir
  CHANGELOG.

## 2026-08-24 (parcours vocabulaire quotidien, §L)

- `src/lib/exam/b1-curriculum.ts` : cohortes de 20 mots/jour depuis les 2319 `DictionaryEntry`
  `inB1Minimum` — familles = mots partageant le même `bare` (homonymes, jamais coupés entre deux
  jours), ordre entre familles pseudo-aléatoire seedé par utilisateur (`seededShuffle`/`makeRng`,
  pas alphabétique). `B1VocabDay` alimenté paresseusement (jour suivant créé quand le jour courant
  est complet — chaque mot a au moins un `Encounter`). Vérifié en prod : 2319 mots → 117 jours,
  premier jour = 20 familles distinctes, aucune coupure de famille.
- `/objectif-b1/reviser` (3 onglets) : **Nouveaux** — nouveau composant `B1NewWords` (aucune
  action existante ne peut servir un mot jamais rencontré, toutes exigent un `Encounter`
  préalable) : flashcard mot+traduction, "j'ai vu ce mot" pose l'Encounter via la même primitive
  que `/add` (`addEncounterAction`). **Hier** / **Mélange** — `VocabCard` existant, étendu d'un
  filtre `entryIds` optionnel sur `getVocabCardAction`, sans nouveau composant.
- Écart assumé par rapport au plan §L : la notion de "famille via `subentries[]`" du JSON n'est
  pas implémentée telle quelle — `data/B1/lexique_b1.json` est gitignored (droit d'auteur) donc
  absent en prod, et les subentries sont des locutions sans `DictionaryEntry`/paradigme propre
  (non pratiquables). Famille = homonymes de même `bare`, seule notion réellement disponible en
  base au runtime.

### Reste à faire (voir plan §Ordre de construction)

- 15 `typeId` lexgram restants (un par un, avec relecture).
- Hub : tableau de bord complet (couverture, tuile du jour, tendances, recommandation IA),
  `/vocabulaire` (Collection scoped B1), mode libre B1 (`b1Only` sur `getPracticeCardAction`).
- KPI (`src/lib/exam/kpi.ts`), carnet d'erreurs, `recommendB1Focus`.
- Notifications de rappel (§O) — maintenant débloqué (§L existe).
- M2 (`speaking`, remonté), M3 (`reading`), M4 (`writing`), M5 (`listening`), M6 (banking/partial).
