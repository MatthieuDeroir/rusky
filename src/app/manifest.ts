import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Русский — entraînement",
    short_name: "Русский",
    description:
      "Construis ton dictionnaire russe au fil de tes lectures : détection des formes, tableaux de déclinaison / conjugaison, révisions espacées et exercices.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1c1813",
    theme_color: "#1c1813",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
