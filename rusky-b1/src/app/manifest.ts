import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rusky — objectif B1",
    short_name: "Rusky",
    description: "Le lexique B1 et la lecture, un peu chaque jour, jusqu’au ТРКИ-1.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#3046e8",
    lang: "fr",
    // Nouveaux noms de fichiers : une PWA installée ne remplace son icône que si l'adresse change.
    icons: [
      { src: "/icons/rusky-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/rusky-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/rusky-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
