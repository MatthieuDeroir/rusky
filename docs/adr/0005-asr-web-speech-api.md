# ADR 0005 — ASR via Web Speech API pour говорение (M2, remonté)

## Statut

Proposé, 2026-08-24 (M2/speaking pas encore construit).

## Contexte

Le sous-test `speaking` (25,2 % de l'examen, le plus lourd — voir ADR 0006) nécessite de
transcrire la réponse orale de l'utilisateur pour la faire noter par le rater LLM.

## Décision

`SpeechRecognition` (Web Speech API) comme implémentation par défaut, derrière une interface
enfichable (`src/lib/exam/asr/`) pour permettre un moteur local (whisper.cpp) plus tard sans
changer le reste du pipeline. Cohérent avec le choix TTS de M5/écoute (ADR 0004) : même famille
de compromis (zéro infra, dépend du navigateur).

## Conséquences

- Chronométrage préparation/réponse imposé côté client, pas de réécoute une fois lancé.
- `fluency` estimée depuis les marqueurs temporels de l'ASR, en plus de la grille écrite standard
  (mêmes critères que письмо).
- **À afficher explicitement dans l'UI** : prononciation/intonation non fiablement évaluées par
  cette chaîne — score indicatif, pas une prédiction de la vraie note (spec §7.3).
