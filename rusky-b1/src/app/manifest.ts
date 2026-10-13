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
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
