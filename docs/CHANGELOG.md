# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Module Objectif B1 (`/objectif-b1`) — hub dédié à la préparation ТРКИ-1 : examens blancs,
  vocabulaire minimum B1, à terme suivi KPI/carnet d'erreurs/parcours quotidien.
- Schéma Prisma : `TrkiPaper`, `TrkiPassage`, `TrkiBankItem`, `TrkiItem`, `TrkiAttempt`,
  `TrkiResponse`, `TrkiSubtestResult`, `TrkiFocusCache`, `B1VocabDay`, `DictionaryEntry.inB1Minimum`,
  `UserStats.b1TargetDate`.
- Moteur de génération lexgram (`src/lib/exam/`) : blueprint déterministe, pipeline
  génération/validation en 6 passes, banque d'items anti-répétition, scoring déterministe (aucun
  LLM à la correction QCM).
- `lexgram.case-government-verb` : premier `typeId` complet, pool = `VERB_CASES` existant.
- Import du lexique minimum B1 (`scripts/import-b1-lexicon.ts`) — 2319/2506 lemmes matchés en
  base (local + Turso).
- Pages `/objectif-b1`, `/objectif-b1/examens`, `/objectif-b1/examens/[paperId]/[subtest]`,
  `/objectif-b1/examens/[paperId]/resultats`, `/admin/quarantine`, `/admin/health`.
- Nav : entrée « Objectif B1 » (desktop + bottom nav mobile).

### Fixed
- Barème ТРКИ-1 : `reading`/`listening` étaient notés à tort 1 pt/item au lieu de 7/4
  respectivement (sous-évaluation ×7 et ×4 de ces deux sous-tests). `writing`/`speaking`/le total
  avaient des `maxPoints` inventés (65/100/380) sans source. Remplacés par le barème officiel
  (165/140/120/80/170, total 675, seuil 446) — voir `docs/adr/0006-bareme-officiel-trki1.md`.
- Règle de réussite : ne testait que la condition par sous-test ; ajout de la condition cumulative
  sur le total (≥ 446), qui n'est PAS automatiquement satisfaite même si tous les sous-tests sont
  individuellement au seuil de 66 % (la somme des seuils individuels vaut 445 < 446 — documenté,
  pas masqué).
- Priorisation des révisions : говорение (25,2 % de l'examen) était sous-estimé dans le phasage
  d'origine ; remonté juste après M1 (nouvel ordre M1 → M2 speaking → M3 reading → M4 writing →
  M5 listening → M6).
- Premier sujet réel créé en prod : échec systématique (10/19 items lexgram). Cause dominante,
  passe 4 (lexique) : tolérance zéro — un mot isolé hors du minimum B1 (souvent un mot A1/A2 déjà
  connu mais absent de la liste curatée, ex. « местный », « зонтик », ou la forme perfective d'un
  verbe déjà listé, ex. « достичь » pour « достигать ») suffisait à rejeter toute la phrase.
  Corrigé : tolérance d'un mot hors-liste par phrase + un verbe est toléré si son partenaire
  aspectuel est dans le minimum B1 (`src/lib/exam/validate.ts`). Cause secondaire : le rate limit
  Mistral (429) pendant les retries en concurrence consommait le budget de tentatives sans
  résultat — ajout d'un backoff court sur 429 dans `chatJson` (`src/lib/mistral.ts`) et
  concurrence lexgram réduite de 4 à 2 (`src/lib/exam/generate.ts`). Revérifié en prod (10 items
  tirés) : plus aucun rejet passe 4 ; les rejets restants sont des erreurs de génération
  ponctuelles (schéma/structure/cible) déjà couvertes par le mécanisme de retry existant.

### Added (suite)
- Passes de "top-up" (`TOP_UP_ROUNDS = 2`) dans `runGeneration` : les slots encore non résolus
  après le premier passage (retries épuisés + rien en banque) sont retentés jusqu'à 2 fois de
  plus avant d'abandonner le sujet — un échec de génération est souvent ponctuel (structure QCM
  dupliquée, mauvais mot mis en trou), pas systématique.
- Barre de progression en temps réel côté hub (`/objectif-b1/examens`) : `TrkiPaper.totalSlots`/
  `resolvedSlots` mis à jour à chaque item résolu pendant la génération, affichés côté client
  (poll 1,5 s) avec une barre qui se remplit + pourcentage, au lieu du seul libellé texte
  "Génération en cours…".

## Migrations

- `20260824115519_add_objectif_b1_module` — schéma initial du module (local + Turso).
- `20260824122610_add_trki_bank_item_rejected` — trace les items rejetés (passes 1-5) pour
  `/admin/health`, en plus des items validés/quarantinés (local + Turso).
- `20260824140847_add_trki_paper_progress` — `TrkiPaper.totalSlots`/`resolvedSlots` pour la barre
  de progression (local + Turso).
