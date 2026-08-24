# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added (M2 говорение, §F du plan)
- Moteur speaking complet : blueprint (`speaking-v1.ts`, 4 typeId — reactive/initiative-dialogue,
  situational-dialogue, monologue), prompts + few-shot par typeId, génération Mistral,
  validation 4 passes (`validate-speaking.ts` — pas de contre-résolution, production libre notée
  au moment de la réponse, pas de la génération), rater (`gradeSpeaking`, grille réalisation/
  grammaire/lexique/fluidité/cohérence + erreurs annotées).
- ASR : Web Speech API (`src/lib/exam/asr/`, ADR 0005), réutilise le wrapper de dictée déjà en
  place (`src/lib/speech.ts`) — repli texte manuel si non supporté par le navigateur.
- Passation dédiée (`SpeakingPassation`) : préparation chronométrée → enregistrement chronométré
  (auto-stop) → transcript soumis au rater → retour affiché (score/5 par critère, erreurs
  annotées) avant la tâche suivante.
- `TrkiResponse.pointsAwarded` (migration, local + Turso) : score fractionnaire pour la production
  libre — une tâche parlée/écrite n'est pas 0/1 comme un QCM. `Slot.points` (généralisation) permet
  un poids par tâche non uniforme au sein d'un sous-test (42/42/43/43 pour les 4 tâches speaking,
  contre 1 pt/item uniforme en lexgram).
- Sujet d'examen "Говорение" disponible à la création (`/objectif-b1/examens`).
- Vérifié en prod avant push : génération (4/4 items valides au premier passage) et notation
  (transcript fabriqué avec fautes réalistes, retour cohérent et actionnable) testées séparément
  via smoke tests réels (`scripts/smoke-test-speaking.ts`, `scripts/smoke-test-grade-speaking.ts`).

### Fixed (passation, retour utilisateur)
- Matrice de réponses lexgram déplacée tout en bas de la page (fallait scroller après chaque item
  pour y répondre) → réponse reportée juste sous chaque item (toujours une rangée séparée, pas un
  clic direct sur l'énoncé — l'esprit "matrice" de l'examen réel est conservé).
- Passe 3 (structure QCM) : un item pouvait avoir sa bonne réponse déjà présente littéralement
  dans la phrase (ex. "принято желать ___ счастья и здоровья" avec "счастья" marqué correct →
  relecture "желать счастья счастья и здоровья", mot répété). Aucune des 6 passes ne le
  détectait (toutes vérifient la grammaire, pas la duplication texte). Nouveau contrôle générique
  (pas spécifique à `case-government-verb`) : rejette si le texte de la bonne réponse réapparaît
  tel quel ailleurs dans la phrase.

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

### Added (parcours vocabulaire quotidien, §L — suite)
- Onglet "Historique" sur `/objectif-b1/reviser` : petit calendrier (aujourd'hui en premier,
  jours précédents ensuite) pour consulter en lecture seule les 20 mots d'un jour passé, avec
  statut par mot (maîtrisé / en cours / pas encore vu).

### Fixed (parcours vocabulaire quotidien, §L — suite)
- Un mot déjà maîtrisé via une pratique antérieure sans rapport avec B1 (ex. déjà vu côté
  Traduire) était silencieusement exclu du total du jour (20 affiché comme 19). Il compte
  maintenant dans le total sans repasser par la boucle carte/test.
- Le compteur affichait "0/19" avant même la première carte au lieu de "1/20" (convention
  "complété" au lieu de "position courante") — corrigé sur les trois écrans (carte, test, rappel).

### Fixed (parcours vocabulaire quotidien, §L)
- Un jour avançait dès que ses mots étaient "vus" (Encounter), sans être réellement testés.
  "Maîtrisé" exige désormais une dernière tentative `vocab:ru-fr` correcte. Nouvelle boucle
  carte → test → (ratés) rappel-carte → retest, jusqu'à un tour sans faute (`B1MasteryPool`,
  remplace `B1NewWords`), appliquée à "Nouveaux" et "Hier".
- Le calendrier avance désormais en jours civils réels depuis le premier jour (indépendamment de
  l'activité) : les jours dus mais non maîtrisés s'accumulent (1 jour raté → 40 mots dus) au lieu
  d'être sautés ou de tout bloquer.

### Added (parcours vocabulaire quotidien, §L)
- `/objectif-b1/reviser` : parcours quotidien de 20 mots/jour tirés du minimum lexical B1 —
  onglets Nouveaux (découverte, nouveau composant `B1NewWords`), Hier et Mélange (révision,
  `VocabCard` existant + nouveau filtre `entryIds`). `B1VocabDay` alimenté paresseusement,
  cohortes ordonnées par tirage pseudo-aléatoire seedé (pas alphabétique), familles (homonymes de
  même `bare`) jamais coupées entre deux jours.
- `getVocabCardAction` : nouveau paramètre optionnel `entryIds` pour restreindre le tirage à un
  sous-ensemble précis de la collection (utilisé par le parcours B1, réutilisable ailleurs).

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
- `20260824185803_add_trki_response_points_awarded` — `TrkiResponse.pointsAwarded` pour le score
  fractionnaire de la production libre (M2 speaking, M4 writing plus tard) (local + Turso).
