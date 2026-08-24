# ADR 0001 — Blueprint en code, pas en table DB

## Statut

Accepté, 2026-08-24.

## Contexte

Le spec initial (§3) propose un modèle `Blueprint` en base (`version`, `subtest`, `slots: Json`).
Le reste de ce dépôt n'utilise jamais ce pattern pour des données de référence figées et
déterministes : `VERB_CASES`/`PREPOSITION_CASES` (`src/lib/sentence.ts`), `CASE_USAGE`
(`src/lib/cases.ts`), les paliers de `src/lib/levels.ts` vivent tous en code TypeScript versionné
par git, jamais en DB.

## Décision

Le blueprint lexgram (`src/lib/exam/blueprints/lexgram-v1.ts`) est du code TS pur, versionné par
un identifiant de chaîne (`LEXGRAM_BLUEPRINT_VERSION = "trki1-lexgram-v1"`) stocké sur
`TrkiPaper.blueprintVersion`. Chaque `typeId` a sa fonction de pool de cibles dédiée
(`src/lib/exam/lexgram/targets.ts`).

## Conséquences

- Traçabilité : un `TrkiPaper` sait quel blueprint l'a produit, rejouable depuis son `seed`, sans
  dépendre d'un état DB qui pourrait diverger silencieusement.
- Faire évoluer un blueprint = un commit de code + une nouvelle version de chaîne, jamais une
  migration de données.
- Pas de modèle `Blueprint` dans `prisma/schema.prisma`.
