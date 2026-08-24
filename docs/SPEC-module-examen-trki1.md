# SPEC — Module « Examen blanc ТРКИ-1 » (russky-self)

> Document de cadrage fourni par l'utilisateur en début de chantier, conservé ici pour référence.
> **Corrigé le 2026-08-24** suite au correctif barème (voir `docs/adr/0006-bareme-officiel-trki1.md`)
> — §2 (`TRKI1_CONFIG`), §7.1 (priorisation) et §10 (phasage M5) mis à jour ; §12 allégé des
> points désormais résolus. Le reste du document est inchangé par rapport à la version d'origine.

## 0. Contexte et contraintes

- **Stack existante** : Next.js / TypeScript, déploiement Vercel, base de données
  existante contenant le « pokédex » lexical de l'utilisateur (lemmes collectés en
  lecture, avec paradigmes).
- **Modèle** : Mistral Small, exécuté en local, accessible via une API
  OpenAI-compatible. Petit modèle ⇒ **un appel = une tâche atomique**. Jamais
  « génère-moi 165 questions ». Toujours JSON structuré en sortie.
  *(Décision actée : réutilise en fait l'API cloud Mistral existante de l'app —
  voir `docs/adr/0002-mistral-cloud-existant.md`.)*
- **Exigence centrale** : chaque tentative doit produire un sujet **différent**
  mais **iso-difficulté et iso-couverture**. Ce n'est donc pas de la génération
  libre : c'est du remplissage de gabarit tiré au sort à partir d'un blueprint
  fixe.
- **Langue de l'interface** : français. Langue du contenu d'examen : russe
  exclusivement.

### Principe directeur

> Le LLM ne décide jamais **ce qui** est testé, seulement **avec quels mots**.
> La couverture grammaticale est décidée par du code déterministe.

---

## 1. Vocabulaire du domaine (à respecter dans tout le code)

| Terme | Sens |
|---|---|
| `Blueprint` | Plan de l'examen : liste des slots à remplir (type d'item, cible grammaticale, thème). Déterministe, versionné. |
| `Slot` | Une case du blueprint : « item de type `lexgram.aspect-choice`, cible `aspect-past-negation`, thème `быт` ». |
| `Item` | Une question générée concrète (énoncé + options + clé + métadonnées). |
| `Paper` | Un sujet complet (5 sous-tests) instancié pour une tentative, pré-généré et figé. |
| `Attempt` | Une passation d'un `Paper` par l'utilisateur. |
| `Subtest` | Un des 5 sous-tests officiels. |
| `Rater` | Le correcteur LLM pour les productions libres (письмо / говорение). |
| `Validator` | La couche déterministe qui rejette les items malformés avant affichage. |

### Codes des sous-tests

```ts
type SubtestCode =
  | 'lexgram'    // Лексика. Грамматика
  | 'reading'    // Чтение
  | 'listening'  // Аудирование
  | 'writing'    // Письмо
  | 'speaking';  // Говорение
```

---

## 2. Configuration de l'examen (CORRIGÉE — voir docs/adr/0006)

Tout paramètre chiffré vit dans `lib/exam/config.ts`, **jamais en dur dans le
code**. Barème officiel (Типовые тесты по русскому языку как иностранному,
первый сертификационный уровень, Zlatoust) :

```ts
export const TRKI1_CONFIG = {
  subtests: {
    lexgram:   { items: 165, pointsPerItem: 1, maxPoints: 165, pass66: 109, pass60: 99,  durationMin: 60 },
    reading:   { items: 20,  pointsPerItem: 7, maxPoints: 140, pass66: 92,  pass60: 84,  durationMin: 50, texts: 3 },
    listening: { items: 30,  pointsPerItem: 4, maxPoints: 120, pass66: 79,  pass60: 72,  durationMin: 35 },
    writing:   { tasks: 2,   maxPoints: 80,  pass66: 53,  pass60: 48,  durationMin: 60 },
    speaking:  { tasks: 4,   maxPoints: 170, pass66: 112, pass60: 102, durationMin: 50, prepMin: 25 },
  },
  total: { maxPoints: 675, pass: 446 },
  passing: {
    threshold: 0.66,
    toleranceFloor: 0.60,
    toleranceSlots: 1,
  },
  bankingYears: 2,
} as const;
```

*(Anciennes valeurs — 20/30/65/100/380 — estimées sans source, ne jamais y revenir.)*

### Règle de réussite (implémentée telle quelle — deux conditions cumulatives)

```
réussi ⟺
    (a) [∀ s : score(s) ≥ pass66(s)]
        ∨ [∃! s₀ : pass60(s₀) ≤ score(s₀) < pass66(s₀) ∧ ∀ s≠s₀ : score(s) ≥ pass66(s)]
  ET
    (b) somme des scores ≥ 446
```

Tout sous-test < pass60 ⇒ échec de ce sous-test, aucune compensation possible.
**Note vérifiée** (`scripts/verify-trki-passing.ts`) : la somme des `pass66` officiels des 5
sous-tests vaut 445, soit *moins* que le seuil total de 446 — satisfaire (a) au plus juste ne
garantit donc pas (b). Comportement voulu, pas un bug (voir ADR 0006).

### Banque de sous-tests

Reproduire la règle de repêchage réelle : un sous-test réussi est **capitalisé
pendant 2 ans**. L'écran d'accueil affiche l'état de la banque et propose deux
modes de tentative :

- `full` — sujet complet, 5 sous-tests.
- `partial` — uniquement les sous-tests non capitalisés ou expirés.

C'est le cœur de la stratégie de révision : l'app doit rendre visible quels
sous-tests sont « sécurisés ».

---

## 3. Modèle de données

*(Implémenté avec des différences délibérées par rapport à ce squelette — voir
`docs/adr/0001-blueprint-en-code-pas-en-db.md` et le plan complet pour le schéma réel : préfixe
`Trki*`, `TrkiPassage` pour les textes/scripts partagés, `TrkiFocusCache`, `B1VocabDay`.)*

```prisma
model Blueprint {
  id          String   @id @default(cuid())
  version     String              // ex. "trki1-v1"
  subtest     SubtestCode
  slots       Json                // Slot[]
  createdAt   DateTime @default(now())
}

model Paper {
  id          String   @id @default(cuid())
  seed        String              // seed RNG, rejouable
  blueprintV  String
  status      PaperStatus         // PENDING | GENERATING | READY | FAILED
  items       Item[]
  createdAt   DateTime @default(now())
}

model Item {
  id           String   @id @default(cuid())
  paperId      String
  subtest      SubtestCode
  typeId       String             // ex. "lexgram.case-government-verb"
  targetId     String             // ex. "dat-after-помогать"
  position     Int
  payload      Json               // stem, options, passage, audioRef…
  answerKey    Json
  points       Int      @default(1)
  contentHash  String             // anti-répétition
  validatedBy  Json               // trace des passes de validation
}

model Attempt {
  id          String   @id @default(cuid())
  userId      String
  paperId     String
  mode        AttemptMode          // FULL | PARTIAL
  startedAt   DateTime
  responses   Response[]
  results     SubtestResult[]
}

model SubtestResult {
  attemptId   String
  subtest     SubtestCode
  rawScore    Float
  maxScore    Float
  ratio       Float
  passed      Boolean
  bankedUntil DateTime?
  rubric      Json?                // détail rater pour writing/speaking
}
```

Ajouter une table `LexicalUnit` si elle n'existe pas déjà, ou réutiliser le
pokédex existant, avec un flag `inB1Minimum: boolean` (cf. §5.3).
*(Implémenté directement comme `DictionaryEntry.inB1Minimum` — voir plan §A.1.)*

---

## 4. Taxonomie des exercices

C'est la partie normative de la spec. Chaque `typeId` doit exister comme module
avec son propre gabarit de prompt et ses propres règles de distracteurs.

### 4.1 `lexgram` — Лексика. Грамматика (165 items, QCM 4 options)

Format unique : phrase à trou, 4 options, une seule correcte, réponse reportée
dans une matrice.

| `typeId` | Cible testée | Items |
|---|---|---|
| `lexgram.case-function` | Cas sans préposition selon la fonction (objet, temps, moyen, appartenance) | 20 |
| `lexgram.case-government-verb` | Rection verbale (помогать + dat, заниматься + instr, ждать + gén/acc) | 20 |
| `lexgram.case-preposition` | Préposition + cas, y compris opposition в/на + acc vs prép | 18 |
| `lexgram.aspect-choice` | Aspect au passé, futur, à l'infinitif après начать/кончить, à l'impératif, sous négation | 18 |
| `lexgram.motion-prefixed` | Verbes de mouvement préfixés (по-, при-, у-, вы-, в-, до-, пере-, про-, за-, об-) | 12 |
| `lexgram.motion-base` | идти/ходить, ехать/ездить, нести/носить : unidirectionnel vs multidirectionnel | 8 |
| `lexgram.verb-form` | Radical réel et alternances (писать → пишу, мочь → могу/мог) | 10 |
| `lexgram.relative-kotoryj` | который décliné selon sa fonction dans la subordonnée | 10 |
| `lexgram.conjunction` | чтобы / если / если бы / потому что / поэтому / хотя / после того как | 10 |
| `lexgram.reported-speech` | Discours direct → indirect, y compris questions avec ли | 6 |
| `lexgram.comparison` | Comparatif, superlatif, чем vs génitif | 6 |
| `lexgram.pronoun` | свой vs его/её/их, себя, весь/всё/все | 6 |
| `lexgram.numeral` | Accord numéral + nom (2–4 gén. sg. / 5+ gén. pl.) | 6 |
| `lexgram.negation` | никто/ничто déclinés, нет + génitif, ни… ни | 5 |
| `lexgram.modal-short` | должен / нужно / можно / нельзя + infinitif, adjectifs courts | 5 |
| `lexgram.collocation` | Collocations et connecteurs figés | 5 |

**Total : 165.**

#### Règle de génération des distracteurs (non négociable)

Chaque item définit 1 clé + 3 distracteurs, chacun tiré d'une **classe d'erreur
nommée**. Un distracteur est toujours une forme réelle du russe :

```ts
type DistractorClass =
  | 'wrong-case'          // même lemme, autre cas plausible
  | 'wrong-aspect'        // partenaire aspectuel
  | 'wrong-prefix'        // autre préfixe de mouvement
  | 'wrong-number'        // sg/pl
  | 'wrong-gender-agree'  // accord erroné
  | 'wrong-government'    // cas régi par un verbe voisin
  | 'wrong-conjugation';  // finale d'une autre classe
```

Interdits : distracteurs orthographiquement impossibles, options
non-mots, plus d'une option grammaticalement acceptable dans le contexte.

### 4.2 `reading` — Чтение (3 textes, 20 items)

Trois textes authentiques ou pseudo-authentiques, 350–500 mots chacun :

| `typeId` | Genre du texte | Items |
|---|---|---|
| `reading.factual` | Informatif / factographique (article de presse, annonce détaillée) | 6 |
| `reading.narrative` | Narratif-descriptif | 7 |
| `reading.argumentative` | Narratif-descriptif avec éléments de raisonnement | 7 |

Types de questions à répartir sur les 20 items, chacun étiqueté :
`main-idea`, `detail`, `referent` (à quoi renvoie ce pronom), `inference`,
`author-attitude`, `lexical-in-context`. Au moins 3 items d'inférence ou
d'attitude auctoriale par sujet — c'est ce qui distingue le B1 du A2.

### 4.3 `listening` — Аудирование (30 items)

| `typeId` | Contenu | Items |
|---|---|---|
| `listening.short-dialogue` | 10 mini-dialogues (3–5 répliques), 1 question chacun : thème, lieu, relation entre locuteurs, intention | 10 |
| `listening.extended-dialogue` | 2 dialogues développés (~1 min 30), 5 questions chacun, dont une sur l'attitude d'un locuteur | 10 |
| `listening.monologue` | 2 monologues (annonce publique, bulletin d'information, récit personnel), 5 questions chacun | 10 |

Contraintes audio : voix distinctes par locuteur, débit paramétrable
(`listening.speechRate`, défaut légèrement ralenti par rapport au russe naturel),
double écoute pour la partie 1, écoute unique pour les parties 2 et 3 — mais
rendre ce comportement configurable. *(Implémenté via Web Speech API côté client
— `docs/adr/0004-tts-web-speech-api.md`.)*

### 4.4 `writing` — Письмо (2 tâches)

| `typeId` | Tâche |
|---|---|
| `writing.restitution` | Restituer le contenu essentiel d'un texte lu (texte-support de ~300 mots fourni), sans copier de phrases entières |
| `writing.free-production` | Production libre — lettre à un ami, carte postale, message. **Minimum 20 phrases / 100 mots**, avec 3 à 5 intentions communicatives imposées et explicitement listées dans la consigne |

Les intentions imposées sont tirées d'une liste fermée (`inviter`, `refuser
poliment`, `s'excuser`, `demander un service`, `raconter un événement passé`,
`donner un conseil`, `exprimer un regret`, `remercier`, `décrire un lieu`,
`justifier un choix`). Le rater vérifie la réalisation de **chacune** — c'est le
critère qui pèse le plus lourd dans les tables officielles.

### 4.5 `speaking` — Говорение (4 tâches)

| `typeId` | Tâche | Items |
|---|---|---|
| `speaking.reactive-dialogue` | Réagir à des répliques enregistrées | 5 stimuli |
| `speaking.initiative-dialogue` | Initier le dialogue dans une situation donnée | 5 situations |
| `speaking.situational-dialogue` | Dialogue suivi dans une situation de la vie quotidienne | 1 |
| `speaking.monologue` | Monologue de 10–12 phrases sur la base d'un texte lu ou d'un thème | 1 |

Chronométrage : temps de préparation puis temps de réponse, tous deux imposés,
sans possibilité de réécoute une fois le chrono lancé.

---

## 5. Pipeline de génération

### 5.1 Séquence

```
1. createPaper(seed)            → tire un blueprint, instancie les Slots
2. pour chaque Slot (en parallèle, concurrence bornée à ~4)
     a. buildPrompt(slot)       → prompt atomique, few-shot 2 exemples
     b. callMistral(prompt)     → JSON strict, temperature 0.85
     c. validate(item)          → §6
     d. si invalide → retry (max 3) avec le motif de rejet injecté dans le prompt
     e. si 3 échecs → fallback sur la banque d'items validés (§5.4)
3. status = READY
```

**Impératif UX** : la génération est un **job d'arrière-plan**, jamais synchrone
au démarrage de l'examen. L'utilisateur lance « Préparer un nouveau sujet », part
faire autre chose, et reçoit une notification quand le `Paper` est `READY`.
Aucun appel LLM ne doit avoir lieu pendant la passation.

### 5.2 Forme des prompts (Mistral Small)

- Instructions système **en anglais** (meilleur suivi d'instruction sur les petits
  modèles), contenu produit **en russe**.
- Sortie contrainte par JSON schema, `response_format: json_object`.
- Une seule question par appel.
- Deux exemplaires few-shot par `typeId`, stockés dans
  `lib/exam/prompts/<typeId>.ts` à côté de leur schéma zod.

Squelette :

```
SYSTEM:
You generate a single Russian-as-a-foreign-language exam item for TORFL-1 (B1).
Output ONLY valid JSON matching the schema. All Russian text must be in Cyrillic.
Never use Latin characters inside Russian fields.

CONSTRAINTS:
- Grammatical target: {target.description}
- The correct answer MUST be the only grammatically acceptable option.
- Distractors: exactly 3, classes {distractorClasses}, all real Russian forms.
- Vocabulary: use only words from the provided allowlist.
- Topic domain: {topic}
- Sentence length: 8–16 words.

ALLOWLIST: {lexicalAllowlist}

EXAMPLES: {fewShot}
```

### 5.3 Contrôle lexical — le point critique

Constituer `data/b1-lexical-minimum.json` à partir du *Лексический минимум B1*
(Andryushina & Kozlova) : ~2 300 lemmes, chacun avec genre, schéma d'accent,
partenaire aspectuel et **rection**.

*(Implémenté : liste réelle obtenue et importée — `data/B1/lexique_b1.json`, 2524 entrées,
2319 correspondances en base via `scripts/import-b1-lexicon.ts`. Le PDF source du livre
n'est jamais lu/transcrit par l'assistant — voir `docs/adr/0003-source-allowlist-lexicale-b1.md`.)*

Cette liste sert à trois choses :

1. **Allowlist de génération** : les prompts reçoivent un échantillon pertinent,
   ce qui empêche Mistral d'introduire du vocabulaire hors niveau.
2. **Validation post-génération** : tout item contenant un lemme absent de la
   liste ET absent du pokédex de l'utilisateur est rejeté.
3. **Jauge de couverture** : `% du minimum B1 présent dans le pokédex`, affichée
   sur le tableau de bord. C'est l'indicateur de préparation le plus honnête dont
   dispose l'app.

La lemmatisation nécessaire à (2) doit être déterministe — utiliser un analyseur
morphologique côté serveur, pas le LLM. *(Implémenté via `normalizeBare`.)*

### 5.4 Banque d'items

Tout item ayant passé la validation est conservé avec ses métadonnées et son
`contentHash`. Elle sert de filet en cas d'échec de génération et permet de
constituer des sujets hors ligne. Elle ne remplace pas la génération : un sujet
ne doit jamais être composé à plus de 20 % d'items rejoués.

---

## 6. Validation (couche déterministe, avant tout affichage)

Mistral Small produira des items faux. La qualité du module dépend entièrement
de cette couche. Pipeline en 6 passes, chacune loggée dans `Item.validatedBy` :

1. **Schéma** — validation zod stricte, rejet immédiat sinon.
2. **Alphabet** — aucun caractère latin dans les champs russes ; `ё` normalisé
   selon une convention unique.
3. **Structure QCM** — exactement 4 options, toutes distinctes, exactement une
   clé, longueur des options homogène (aucune option ne doit être notablement
   plus longue : c'est un indice involontaire).
4. **Lexique** — tous les lemmes dans l'allowlist (§5.3).
5. **Cible** — l'item teste bien la cible annoncée : vérification par règles
   (le trou porte-t-il sur la bonne catégorie morphologique ?). Si la cible est
   `case-government-verb`, le verbe régissant doit être présent dans la phrase.
6. **Contre-résolution** — second appel au modèle, en mode *solveur*, sans la
   clé, `temperature: 0`. Si la réponse du solveur diffère de la clé, l'item est
   mis en quarantaine plutôt que supprimé, et remonté dans une file de revue
   manuelle. Un désaccord signale soit une clé fausse, soit un item ambigu :
   dans les deux cas il ne doit pas partir en examen.

Exposer une page `/admin/quarantine` pour trancher à la main. Ce sera aussi ton
meilleur outil de debug de prompts.

---

## 7. Correction

### 7.1 Sous-tests QCM — **aucun LLM**

`lexgram`, `reading`, `listening` : comparaison directe à la clé, scoring
déterministe, temps de réponse par item enregistré. La correction par LLM d'un
QCM est une source de bruit pure.

Restituer en plus un **diagnostic par cible** : taux de réussite par `targetId`,
agrégé sur toutes les tentatives. C'est ce tableau, et non le score global, qui
pilote les révisions — il doit alimenter directement la génération d'exercices
ciblés dans le mode entraînement du pokédex.

**Priorisation (CORRIGÉE — voir §5 du correctif barème / docs/adr/0006)** :
говорение (170 pts, 25,2 %) est le sous-test le plus lourd, suivi de лексика-грамматика
(165 pts, 24,4 %), чтение (140 pts, 20,7 %), аудирование (120 pts, 17,8 %), письмо
(80 pts, 11,9 %). Toute logique de recommandation/priorisation doit refléter cet ordre,
pas l'inverse.

### 7.2 Письмо — rater LLM avec grille explicite

Un appel par tâche, `temperature: 0.2`, grille imposée dans le prompt et sortie
JSON avec un champ par critère :

| Critère | Ce qui est évalué |
|---|---|
| `intentions` | Réalisation de chacune des intentions imposées (liste, une par une, réalisée/non réalisée) |
| `content` | Complétude et pertinence du contenu, respect du volume minimal |
| `composition` | Structure, connecteurs, cohérence, absence de copier-coller du texte-support |
| `grammar` | Correction morphosyntaxique |
| `lexis` | Adéquation et variété lexicales |
| `orthography` | Orthographe et ponctuation |

Le rater doit également renvoyer `errors: [{ span, type, correction, explanationFr }]`
pour alimenter un carnet d'erreurs. Le volume minimal (20 phrases / 100 mots) est
vérifié **par du code**, pas par le modèle.

### 7.3 Говорение — chaîne ASR + rater

- Enregistrement navigateur, chrono de préparation puis de réponse.
- Transcription par un moteur ASR **enfichable** (`lib/exam/asr/`) : Web Speech
  API en implémentation par défaut, whisper.cpp local en implémentation
  alternative. Interface commune, choix par variable d'environnement.
- Le rater note le **transcript**, avec la même structure de grille que письмо,
  plus `fluency` estimée à partir des marqueurs temporels.

**À dire explicitement dans l'UI** : la prononciation et l'intonation ne sont pas
évaluées de façon fiable par cette chaîne. Le score говорение est indicatif ; il
sert à travailler le format et le débit, pas à prédire la note réelle.

---

## 8. Variété et anti-répétition

- `seed` par `Paper`, RNG seedé (`seedrandom`), tirage reproductible.
- Rotation des thèmes : chaque `Slot` reçoit un domaine thématique tiré sans
  remise dans une liste fermée (`быт`, `учёба`, `работа`, `путешествие`,
  `здоровье`, `город`, `семья`, `свободное время`, `погода`, `покупки`,
  `транспорт`, `культура`).
- Rejet des quasi-doublons : `contentHash` sur la phrase normalisée + similarité
  cosinus sur embeddings contre les items des **5 derniers sujets**. Seuil de
  rejet à 0.9, ajustable.
- Rotation des cibles à l'intérieur d'un `typeId` : si `case-government-verb`
  vaut 20 items, ce sont 20 verbes régissants **distincts**, tirés sans remise.

---

## 9. Passation

- Un sous-test = un écran plein, chrono visible, non interruptible une fois lancé.
- Reproduire la **matrice de réponses** : l'utilisateur coche dans une grille
  séparée de l'énoncé, comme à l'examen réel. Perdre des points au report est une
  erreur qui s'entraîne.
- Copier-coller désactivé, sortie de plein écran journalisée, aucune aide
  contextuelle ni dictionnaire pendant la passation.
- Sauvegarde continue des réponses ; une déconnexion ne doit pas détruire la
  tentative, mais le chrono continue de courir.
- Ordre officiel : `lexgram` → `reading` → `writing`, puis `listening` →
  `speaking`. Proposer un mode « 2 jours » pour reproduire l'étalement réel.

---

## 10. Phasage (CORRIGÉ — говорение remonté après M1, voir §5 du correctif barème)

L'ordre de construction suit l'ordre de rentabilité des sous-tests, pas la
facilité d'implémentation. **говорение (170 pts, le plus lourd de l'examen) ne peut
plus rester en fin de phasage** — remonté juste après M1.

| Jalon | Contenu | Cible |
|---|---|---|
| **M1** | Schéma de données, config, moteur de blueprint, `lexgram` complet avec ses 16 `typeId`, validation 6 passes, scoring déterministe, matrice de réponses | Utilisable en septembre |
| **M2** (ex-M5) | `speaking` : ASR enfichable, chronos, rater — remonté ici vu son poids (25,2 % de l'examen) | — |
| **M3** (ex-M2) | `reading` : 3 genres, 6 types de questions, diagnostic par cible | — |
| **M4** (ex-M3) | `writing` : les 2 tâches, rater avec grille, carnet d'erreurs | — |
| **M5** (ex-M4) | `listening` : TTS, voix multiples, contrôle du débit | — |
| **M6** | Banque de sous-tests, mode `partial`, jauge de couverture du minimum B1, examens blancs chronométrés sur 2 jours | — |

M1 seul a déjà de la valeur : il couvre le deuxième sous-test le plus lourd en points
et le plus bachotable.

---

## 11. Documentation à maintenir (obligatoire)

À chaque incrément, mettre à jour dans `docs/` :

- `docs/PROGRESS.md` — état d'avancement par jalon, avec date et ce qui reste.
  Une ligne par session de travail, jamais réécrite rétroactivement.
- `docs/CHANGELOG.md` — format Keep a Changelog, versionné.
- `docs/adr/NNNN-titre.md` — une décision d'architecture par fichier (choix du
  moteur ASR, du lemmatiseur, stratégie de validation…), avec contexte, options
  écartées et conséquences.
- `docs/exam-taxonomy.md` — la table du §4 tenue à jour ; toute modification d'un
  `typeId` ou d'une répartition d'items s'y répercute immédiatement.
- `docs/prompts/` — chaque gabarit de prompt versionné, avec les résultats de la
  dernière campagne de validation (taux de rejet par passe, taux de désaccord du
  solveur).

Le taux de rejet par passe de validation est la métrique de santé du module :
l'exposer sur une page `/admin/health`.

---

## 12. Points à vérifier avant de figer la config

*(Allégé — les points barème/pondération, RÉSOLUS le 2026-08-24, ont été retirés ;
voir `docs/adr/0006-bareme-officiel-trki1.md`. Restent deux questions ouvertes.)*

1. Nombre d'écoutes autorisées par partie en аудирование.
2. Structure précise des 4 tâches de говорение selon le centre d'examen visé.

Source de vérité : les *Типовые тесты по русскому языку как иностранному,
первый сертификационный уровень* (Zlatoust) et les annales publiées par le
centre de tests de l'université de Saint-Pétersbourg. Confronter la config aux
annales papier avant le premier examen blanc chronométré de décembre.
