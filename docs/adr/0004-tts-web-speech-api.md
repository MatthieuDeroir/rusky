# ADR 0004 — TTS via Web Speech API pour аудирование (M5)

## Statut

Proposé, 2026-08-24 (M5 pas encore construit).

## Contexte

Le sous-test `listening` nécessite de la synthèse vocale russe pour les scripts de dialogues/
monologues générés, avec voix distinctes par locuteur et débit réglable.

## Décision

`speechSynthesis` (Web Speech API, navigateur) plutôt qu'un service TTS externe payant/à héberger.
`TrkiPassage.text` sert de script lu côté client au moment de la passation — aucun fichier audio
n'est généré ni stocké côté serveur. Voix par locuteur = sélection de `SpeechSynthesisVoice`
différentes ; débit = `utterance.rate`, piloté par `TRKI1_CONFIG.subtests.listening.speechRate`.

## Conséquences

- Zéro infrastructure supplémentaire, zéro coût par génération audio.
- Qualité/disponibilité des voix russes dépend de l'OS/navigateur de l'utilisateur — pas garantie
  identique partout. Acceptable pour un usage personnel, à documenter dans l'UI si le rendu est
  décevant sur un poste donné.
- Double écoute forcée pour la partie 1, écoute unique pour 2-3 : contrôlé côté client (pas de
  replay au-delà du configuré), pas par une contrainte serveur.
