// Interface ASR enfichable (§7.3 du spec, ADR 0005) : Web Speech API en implémentation par
// défaut. Réutilise le wrapper déjà en place pour la dictée dans /add (src/lib/speech.ts) plutôt
// que de dupliquer l'accès à la primitive navigateur — un moteur local (whisper.cpp) pourrait
// remplacer ceci plus tard sans changer le reste du pipeline speaking.
export { getRecognitionCtor, noopSubscribe, type Recognition } from "@/lib/speech";
