import type { Metadata } from "next";
import { Lora, Onest, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NavLinks } from "@/components/nav-links";

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
              <span className="relative grid size-9 place-items-center rounded-full border border-primary/40 font-display text-xl leading-none text-primary transition-colors group-hover:border-primary/70">
                Я
                <span className="absolute -bottom-px left-1/2 h-px w-4 -translate-x-1/2 bg-primary/60" />
              </span>
              <span className="font-display text-xl tracking-tight">Русский</span>
            </Link>
            <NavLinks />
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <footer className="mx-auto w-full max-w-5xl px-4 py-8 text-center text-xs text-foreground/50">
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
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
