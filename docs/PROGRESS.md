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

### Reste à faire (voir plan §Ordre de construction)

- 15 `typeId` lexgram restants (un par un, avec relecture).
- Hub : tableau de bord complet (couverture, tuile du jour, tendances, recommandation IA),
  `/vocabulaire`, `/reviser` (b1Only + parcours quotidien 20 mots/jour par famille lexicale).
- KPI (`src/lib/exam/kpi.ts`), carnet d'erreurs, `recommendB1Focus`.
- M2 (`speaking`, remonté), M3 (`reading`), M4 (`writing`), M5 (`listening`), M6 (banking/partial).
