# ADR 0006 — Barème officiel ТРКИ-1

## Statut

Accepté, 2026-08-24.

## Contexte

Le `TRKI1_CONFIG` initial (spec §2, `docs/SPEC-module-examen-trki1.md`) contenait des valeurs
`maxPoints` inventées — 20/30/65/100/380 pour reading/listening/writing/speaking/total,
explicitement signalées « à confirmer » dans la spec mais déjà utilisées en dur dans le code
(`isPassed()` travaillait sur des ratios simples, un seuil unique à 0.66/0.60). Trois des cinq
valeurs étaient fausses : `reading` et `listening` sont des QCM notés à **7** et **4** points par
item respectivement (pas 1), et `writing`/`speaking` n'ont jamais été 65/100.

L'utilisateur a fourni le barème réel, sourcé dans les *Типовые тесты по русскому языку как
иностранному, первый сертификационный уровень* (Zlatoust).

## Décision

Barème remplacé intégralement dans `src/lib/exam/config.ts` :

| Sous-test | Items/tâches | Pts/item | Max | Seuil 66% | Plancher 60% | Poids |
|---|---|---|---|---|---|---|
| Говорение | 4 tâches | grille | 170 | 112 | 102 | 25,2 % |
| Лексика · Грамматика | 165 | 1 | 165 | 109 | 99 | 24,4 % |
| Чтение | 20 | 7 | 140 | 92 | 84 | 20,7 % |
| Аудирование | 30 | 4 | 120 | 79 | 72 | 17,8 % |
| Письмо | 2 tâches | grille | 80 | 53 | 48 | 11,9 % |
| **Total** | | | **675** | **446 (66,07%)** | | |

`говорение` est le sous-test le plus lourd de l'examen (25,2 %), pas `lexgram` — toute logique de
priorisation/recommandation (§K du plan, `recommendB1Focus`) doit refléter cet ordre.

`isPassed()` travaille désormais sur des **scores bruts en points** (`SubtestOutcome[]`), pas des
ratios, et implémente deux conditions cumulatives (ET), pas une seule :
1. **(a)** la règle par sous-test (tous ≥ pass66, ou un seul dans [pass60, pass66) et les autres
   ≥ pass66) ;
2. **(b)** la somme des scores ≥ 446.

`TrkiItem.points` est désormais posé explicitement à la génération depuis
`TRKI1_CONFIG.subtests[subtest].pointsPerItem` (au lieu du défaut Prisma `1`) — piège identifié :
sans ce correctif, tout futur sous-test `reading`/`listening` aurait été noté à 1 pt/item comme
`lexgram`, silencieusement faux.

## Incohérence documentée, pas corrigée arbitrairement

**La somme des `pass66` officiels vaut 445, soit *moins* que le seuil total de 446.** Autrement
dit, satisfaire la condition (a) au plus juste (chaque sous-test exactement à son seuil de 66 %)
ne suffit *pas* à satisfaire (b). C'est vérifié explicitement par
`scripts/verify-trki-passing.ts` (Cas 1 et Cas 5) plutôt que masqué : je n'ai pas de moyen de
savoir laquelle des 6 valeurs (`pass66` × 5 + `pass66` total = 446) contient l'éventuelle erreur
d'arrondi d'origine, donc je n'en ai modifié aucune unilatéralement. Implication pratique : une
tentative avec les 5 sous-tests pile au seuil individuel échoue globalement de 1 point — un
candidat réel viserait donc un peu de marge sur au moins un sous-test, pas l'exact seuil. À
confronter aux annales papier (spec §12) si l'écart surprend à l'usage réel.

## Conséquences

- `docs/SPEC-module-examen-trki1.md` §2/§7.1/§10 mis à jour pour ne pas rester en contradiction
  avec le code.
- Phasage (§10) : M5 (`speaking`) remonté juste après M1 — c'est désormais le 2ᵉ jalon, pas le
  dernier avant M6.
- `ExamResults` (UI) affiche les deux niveaux : 5 lignes indépendantes (score/max/seuils/statut)
  **et** une ligne de total (score/675, seuil 446) — jamais un pourcentage global à la place des
  5 lignes, la condition par sous-test reste la contrainte dominante.
