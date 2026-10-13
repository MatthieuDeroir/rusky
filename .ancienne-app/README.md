# Ancienne app (v1–v3), archivée le 13 octobre 2026

Remplacée par `rusky-b1/`. Rangée ici pour ne plus interférer (build Vercel, Turbopack, PostCSS).

- `code.tar.zst` : tout le code suivi par git de l'ancienne app (245 fichiers). Il est aussi dans
  l'historique git, jusqu'au commit `cc0d9ac`.
- `donnees.tar.zst` (local, ignoré par git) : `prisma/dev.db`, `prisma/backups/`, `prisma/_legacy-json/`
  (1,7 Go décompressés). Comparé octet par octet aux originaux avant leur suppression.
- `.env`, `.env.local`, `.env.backup-before-turso`, `.vercel/` (locaux, ignorés) : accès à l'ancienne
  base Turso `rusky` (lecture seule, source de l'import) et retour arrière possible.
  `rusky-b1/scripts/import-from-legacy.ts` lit `.env` ici.

Restaurer :

```sh
mkdir /tmp/ancienne-app && cd /tmp/ancienne-app
tar -I zstd -xf "…/.ancienne-app/code.tar.zst"
tar -I zstd -xf "…/.ancienne-app/donnees.tar.zst"
cp "…/.ancienne-app/.env" . && npm install && npx next dev -p 3011
```
