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

## Migrations

- `20260824115519_add_objectif_b1_module` — schéma initial du module (local + Turso).
- `20260824122610_add_trki_bank_item_rejected` — trace les items rejetés (passes 1-5) pour
  `/admin/health`, en plus des items validés/quarantinés (local + Turso).
