import type { Metadata, Viewport } from "next";
import { Lora, Onest, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NavLinks } from "@/components/nav-links";
import { Logo } from "@/components/logo";
import { BottomNav } from "@/components/bottom-nav";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-30 px-4 py-4">
          <nav className="glass mx-auto flex max-w-5xl items-center justify-between rounded-2xl py-2.5 pl-3 pr-2">
            <Link href="/" className="group flex items-center gap-2.5">
              <Logo
                size={34}
                className="text-primary transition-transform group-hover:-translate-y-0.5"
              />
              <span className="font-display text-xl tracking-tight">Русский</span>
            </Link>
            {/* Full nav on desktop; mobile uses the bottom bar instead. */}
            <div className="hidden sm:block">
              <NavLinks />
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 pb-24 sm:pb-8">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 text-center text-xs text-foreground/50 sm:pb-8">
          Données :{" "}
          <a
            href="https://github.com/Badestrand/russian-dictionary"
            className="underline underline-offset-2 hover:text-foreground/80"
            target="_blank"
            rel="noreferrer"
          >
            OpenRussian
          </a>{" "}
          (CC BY-SA 4.0), complétées pour les pronoms et numéraux.
        </footer>
        <BottomNav />
        <UpdatePrompt />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
