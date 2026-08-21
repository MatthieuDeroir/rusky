import type { Metadata, Viewport } from "next";
import { Lora, Onest, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SiteChrome } from "@/components/site-chrome";
import { UpdatePrompt } from "@/components/pwa/update-prompt";

// Editorial pairing: Lora (literary serif, for Russian headwords/titles) + Onest (UI).
const display = Lora({
  variable: "--font-lora",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const sans = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Русский — entraînement",
  description:
    "Construis ton dictionnaire russe au fil de tes lectures : détection des formes, tableaux de déclinaison/conjugaison et exercices.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Русский" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1c1813",
};

// Pas d'appel dynamique (cookies/DB) ICI : un layout racine qui lit les cookies force Next.js à
// re-rendre tout le layout côté serveur à CHAQUE navigation (même client-side), au lieu de le
// garder monté et de ne rafraîchir que la page — c'était la cause de fond de la lenteur perçue
// sur toute l'app. Le streak est donc récupéré côté client par SiteChrome (une fois, au montage).
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteChrome>{children}</SiteChrome>
        <UpdatePrompt />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
