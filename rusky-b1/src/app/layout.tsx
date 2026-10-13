import type { Metadata, Viewport } from "next";
import { Golos_Text, Literata } from "next/font/google";
import { Toaster } from "sonner";
import { Nav } from "@/components/nav";
import { RegisterSW } from "@/components/pwa/register-sw";
import { RouteTracker } from "@/components/back-link";
import "./globals.css";

const golos = Golos_Text({ variable: "--font-golos", subsets: ["latin", "cyrillic"], display: "swap" });
const literata = Literata({ variable: "--font-literata", subsets: ["latin", "cyrillic"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Rusky", template: "%s · Rusky" },
  description: "Préparer le ТРКИ-1 : le lexique B1 et la lecture, un peu chaque jour.",
  appleWebApp: { capable: true, title: "Rusky", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#10121a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${golos.variable} ${literata.variable} h-full antialiased`}>
      <body className="min-h-full bg-paper text-ink">
        <Nav />
        <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-28 sm:pt-24 sm:pb-16">{children}</main>
        <Toaster position="top-center" />
        <RegisterSW />
        <RouteTracker />
      </body>
    </html>
  );
}
