# ADR 0003 — Source de l'allowlist lexicale B1

## Statut

Accepté, 2026-08-24.

## Contexte

La passe de validation 4 (lexique, §6 spec) doit rejeter tout item lexgram utilisant un mot hors
minimum B1. Le référentiel officiel — *Лексический минимум по русскому языку как иностранному.
Первый сертификационный уровень* (Андрюшина, Битехтина, Клобукова, Норейко, Одинцова — Златоуст,
7ᵉ éd. électronique 2014/2015, ISBN 9785865478621) — a été localisé et son authenticité vérifiée
(`data/B1/Лексический минимум В1.pdf`, 199 pages). Sa page de titre porte une mention explicite de
droits réservés interdisant toute copie sans autorisation écrite de l'éditeur.

## Décision

Le PDF de l'ouvrage n'est **jamais lu ni retranscrit par l'assistant**, quelle que soit la
méthode (OCR, copier-coller, resaisie) ni l'usage (personnel ou non) — cette limite porte sur ce
que l'assistant reproduit, indépendamment du statut légal de la possession du fichier par
l'utilisateur.

La **liste de mots** (pas le livre — juste les lemmes russes + gloses françaises + info
grammaticale minimale) a été extraite par l'utilisateur lui-même, hors de cette session, et
fournie sous forme de données structurées : `data/B1/lexique_b1.json` (2524 entrées) +
`lexique_b1.csv`. Ce fichier est consommé comme n'importe quelle donnée d'import fournie par
l'utilisateur pour son app personnelle.

## Conséquences

- `DictionaryEntry.inB1Minimum` peuplé par `scripts/import-b1-lexicon.ts` — 2319/2506 lemmes
  distincts matchés (92,5 %), le reste journalisé en console (jamais en DB) pour ajout manuel
  ultérieur via `/add` si pertinent.
- Champ bonus `fr` du JSON utilisé pour compléter `DictionaryEntry.translationsFr` quand vide.
- Script exécuté à la fois en local (`prisma/dev.db`) et sur Turso (production) — voir
  `docs/CHANGELOG.md`.
- Si l'utilisateur retrouve un jour une extraction déjà propre de la liste officielle (mots seuls,
  sans mise en page ni traductions du livre), elle pourra remplacer `lexique_b1.json` sans
  changement de code — seul le fichier source change.
