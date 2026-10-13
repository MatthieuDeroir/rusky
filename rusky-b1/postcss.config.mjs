// Vide exprès : Tailwind passe par le loader Turbopack (next.config.ts). Sans ce fichier, la
// config PostCSS de l'ancienne app (racine du dépôt) serait reprise lors d'un build depuis Git.
const config = { plugins: {} };

export default config;
