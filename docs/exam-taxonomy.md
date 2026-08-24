# Taxonomie des sous-tests ТРКИ-1

Tenu à jour à chaque `typeId`/tâche livré(e). Voir `docs/SPEC-module-examen-trki1.md` §4 pour la
définition complète, et `docs/adr/0006-bareme-officiel-trki1.md` pour le barème.

## Poids par sous-test (barème officiel)

| Sous-test | Max pts | Seuil 66% | Plancher 60% | Poids | Statut |
|---|---|---|---|---|---|
| Говорение | 170 | 112 | 102 | 25,2 % | Pas construit (M2) |
| Лексика · Грамматика | 165 | 109 | 99 | 24,4 % | En cours (M1) |
| Чтение | 140 | 92 | 84 | 20,7 % | Pas construit (M3) |
| Аудирование | 120 | 79 | 72 | 17,8 % | Pas construit (M5) |
| Письмо | 80 | 53 | 48 | 11,9 % | Pas construit (M4) |
| **Total** | **675** | **446 (66,07%)** | — | 100 % | — |

## `lexgram` — 16 `typeId`, 165 items

| `typeId` | Cible | Items visés | Statut |
|---|---|---|---|
| `lexgram.case-government-verb` | Rection verbale | 20 (19 verbes curatés disponibles) | ✅ construit, pool = `VERB_CASES` |
| `lexgram.case-preposition` | Préposition + cas | 18 | ⬜ à construire (pool identifié : `caseTriggers()`) |
| `lexgram.aspect-choice` | Aspect | 18 | ⬜ à construire (pool identifié : `DictionaryEntry.aspect/partner`) |
| `lexgram.case-function` | Cas sans préposition | 20 | ⬜ pool à curer |
| `lexgram.motion-prefixed` | Verbes de mouvement préfixés | 12 | ⬜ pool à curer |
| `lexgram.motion-base` | Uni- vs multidirectionnel | 8 | ⬜ pool à curer |
| `lexgram.verb-form` | Alternances de radical | 10 | ⬜ pool à curer |
| `lexgram.relative-kotoryj` | который | 10 | ⬜ pool à curer |
| `lexgram.conjunction` | Connecteurs | 10 | ⬜ pool à curer |
| `lexgram.reported-speech` | Discours indirect | 6 | ⬜ pool à curer |
| `lexgram.comparison` | Comparatif/superlatif | 6 | ⬜ pool à curer |
| `lexgram.pronoun` | свой/себя/весь | 6 | ⬜ pool à curer |
| `lexgram.numeral` | Accord numéral | 6 | ⬜ pool à curer |
| `lexgram.negation` | никто/ничто/ни…ни | 5 | ⬜ pool à curer |
| `lexgram.modal-short` | Modaux + adjectifs courts | 5 | ⬜ pool à curer |
| `lexgram.collocation` | Collocations figées | 5 | ⬜ pool à curer |

Ordre de construction des 13 restants : celui de ce tableau (§Ordre de construction du plan),
un par un, jamais en lot.

## Validation — 6 passes (implémentées, génériques à tout `lexgram.*`)

1. Schéma (zod) — ✅
2. Alphabet — ✅
3. Structure QCM — ✅
4. Lexique (allowlist B1 réelle, `data/B1/lexique_b1.json`) — ✅
5. Cible (heuristique par typeId — actuellement spécifique à `case-government-verb`, à
   généraliser au fur et à mesure des typeId suivants) — ✅ (1/16 typeId)
6. Contre-résolution (solveur Mistral, température 0) — ✅
