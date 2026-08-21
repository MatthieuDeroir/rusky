# Carnet de développement

Idées et chantiers identifiés mais pas encore faits. Cocher/supprimer une fois traité.

## Ajout de mots (`/add`)

- [ ] **Suggestions de recherche** : proposer les mots les plus proches quand la saisie ne
      correspond à rien exactement (fautes de frappe, formes voisines).
- [ ] **Dictée multi-mots** : à chaque phrase reconnue, l'ajouter à la suite dans le champ (déjà
      fait pour la dictée continue) — vérifier que la détection traite bien tous les mots
      séparés par des espaces en une seule recherche (déjà le cas côté `detectSentenceAction`,
      à confirmer côté UX). Le champ doit pouvoir s'agrandir en zone de texte multi-lignes quand
      il y a beaucoup de mots, au lieu de rester une ligne unique.

## Exercices

- [x] **Travailler ses erreurs** (`/exercices/erreurs`) : choix Réviser / Traduire, chacun ne
      piochant que dans les mots dont la dernière tentative a échoué. Pas encore d'autres types
      (Cas, Chiffres…) dans ce sélecteur — à étendre si besoin.

## Dictionnaire (qualité des données)

- [ ] 92 autres entrées du dictionnaire ont le même symptôme que l'ancien bug кошки (le lemme ne
      correspond pas à sa propre forme "nominatif singulier" générée) — aucune n'est dans la
      collection actuelle donc pas urgent, mais latent. À auditer/nettoyer un jour.
