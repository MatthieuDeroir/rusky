"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, Snowflake } from "lucide-react";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/nav-links";
import { BottomNav } from "@/components/bottom-nav";
import { RadioProvider } from "@/components/radio/radio-provider";
import { MiniPlayer } from "@/components/radio/mini-player";

// Wraps the page in the app chrome (header, footer, bottom nav) — except on /login, which is a
// standalone full-screen page with no navigation.
export function SiteChrome({
  children,
  streak,
}: {
  children: React.ReactNode;
  streak: { streak: number; freezes: number } | null;
}) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8">{children}</main>
    );
  }

  return (
    <RadioProvider>
      {/* Header, Citoyen-style: brand left, streak + freezes right, no glass panel behind it. */}
      <header className="px-4 pt-5 pb-1">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Link href="/" className="group flex items-center gap-2.5">
            <Logo
              size={32}
              className="text-primary transition-transform group-hover:-translate-y-0.5"
            />
            <span className="font-display text-xl tracking-tight">Русский</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <NavLinks />
            </div>
            {streak && (
              <div
                className="flex items-center gap-1.5 rounded-full bg-primary/12 px-3 py-1.5 font-semibold text-primary ring-1 ring-primary/25"
                title={`${streak.streak} jour${streak.streak > 1 ? "s" : ""} d’affilée${
                  streak.freezes > 0 ? ` · ${streak.freezes} gel${streak.freezes > 1 ? "s" : ""}` : ""
                }`}
              >
                <Flame className="size-[18px]" />
                <span className="tabular-nums">{streak.streak}</span>
                {streak.freezes > 0 && (
                  <span className="flex items-center gap-0.5 text-sky-300/80">
                    <Snowflake className="size-3.5" />
                    <span className="text-xs tabular-nums">{streak.freezes}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 sm:pb-8">{children}</main>

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
      <MiniPlayer />
    </RadioProvider>
  );
}
