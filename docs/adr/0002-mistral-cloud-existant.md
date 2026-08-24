# ADR 0002 — Réutilisation de l'intégration Mistral cloud existante

## Statut

Accepté, 2026-08-24.

## Contexte

Le spec initial (§0) demandait un Mistral Small **local**, accessible via une API
OpenAI-compatible, pour des raisons de coût/débit implicites. Le reste de l'app appelle déjà
Mistral en cloud (`api.mistral.ai`, `MISTRAL_API_KEY`) pour la correction TORFL
(`gradeProduction`) et les recommandations (`recommendExam`), via `src/lib/mistral.ts`.

## Décision

Le module examen réutilise cette même intégration cloud, sans serveur local. Toute nouvelle
fonction d'appel LLM pour ce module (`generateLexgramItem`, `solveLexgramItem`, et les futures
`gradeWriting`/`gradeSpeaking`) vit dans `src/lib/mistral.ts`, à côté des fonctions existantes,
dans le même style (mêmes helpers `apiKey()`/`model()`/`chatJson`).

## Conséquences

- Aucune nouvelle infrastructure à héberger/maintenir.
- Coût par appel à surveiller (voir plan, §Vérification, point coût) — un `Paper` lexgram complet
  peut représenter jusqu'à 165 × (4 tentatives + 1 solveur) appels dans le pire cas.
- `ChatMsg` (system/user uniquement, pas de rôle assistant) n'a pas été modifié pour rester
  compatible avec les usages TORFL existants — le few-shot des prompts examen est injecté dans le
  texte du message `user`, pas via des tours `assistant` séparés.
