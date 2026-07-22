# Русский — entraînement

Application personnelle (Next.js) pour construire ton vocabulaire russe au fil de tes
lectures. Tu saisis un mot tel que tu l'as rencontré (fléchi ou non, avec ou sans accent),
l'app **détecte** sa nature (nom, verbe, adjectif, pronom, numéral…), sa forme dictionnaire et
le cas / la conjugaison entrés, puis **remplit la bonne case** de son tableau. Les autres cases
restent vides : à toi de les compléter, puis de les réviser en mode **Pratiquer**.

## Fonctionnalités

- **Détection hors-ligne** de la forme saisie via un index inverse (toute forme fléchie →
  lemme + cas/temps). L'ambiguïté (ex. `книги` = génitif sing. / nominatif plur. / accusatif
  plur.) est présentée pour que tu choisisses.
- **Tableaux complets** pour toutes les classes fléchies : noms (6 cas × sing./plur.), verbes
  (présent/futur, passé, impératif), adjectifs (6 cas × m/f/n/plur. + formes courtes),
  **pronoms** et **numéraux** (déclinaison complète).
- **Suivi de progression** : anneau « cases découvertes / total » par mot.
- **Exercices** : l'app demande une case non encore rencontrée ; la réponse est vérifiée sans
  exiger l'accent et accepte les variantes correctes.

## Stack

Next.js (App Router, TypeScript) · Tailwind v4 + shadcn/ui (esthétique glassmorphism) ·
Prisma 7 + SQLite (adaptateur better-sqlite3).

## Démarrage

```bash
npm install
npm run db:migrate     # crée prisma/dev.db (sauvegarde auto d'abord)
npm run db:seed        # importe le dictionnaire de référence (sauvegarde auto d'abord)
npm run dev            # http://localhost:3000
```

## Données

- **Modèle de référence** (lecture seule, ~59 000 entrées) : tables `DictionaryEntry` /
  `DictionaryForm`, alimentées depuis `data/`.
- **Données personnelles** (modifiables) : `Encounter` (mots rencontrés) et `QuizAttempt`
  (historique d'exercices).

Source du dictionnaire : [OpenRussian](https://github.com/Badestrand/russian-dictionary)
(CC BY-SA 4.0), complétée à la main pour les pronoms et numéraux (`data/supplement/`).
Voir `data/README.md`.

## Base de données & sauvegardes

La base est un fichier SQLite local : `prisma/dev.db`.

- **Toujours** sauvegardé automatiquement avant migration ou seed (`npm run db:backup` est
  enchaîné par `db:migrate` et `db:seed`). Les copies horodatées vont dans `prisma/backups/`.
- `npm run db:backup` — sauvegarde manuelle.
- `npm run db:studio` — explorer/éditer les données (Prisma Studio).
- Re-seed complet (efface puis reconstruit la référence) : `FORCE_RESEED=1 npm run db:seed`.

> Note : un `build` Next casse le serveur de dev en cours — relance `npm run dev` ensuite.

## Scripts utilitaires (`scripts/`)

- `verify.ts` — teste la détection sur un échantillon de mots.
- `verify-quiz.ts` — teste la vérification des réponses d'exercice.
- `seed-demo.ts` — insère quelques rencontres de démonstration (`… clear` pour les retirer).
