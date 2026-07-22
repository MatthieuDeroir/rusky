"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/nav-links";
import { BottomNav } from "@/components/bottom-nav";

// Wraps the page in the app chrome (header, footer, bottom nav) — except on /login, which is a
// standalone full-screen page with no navigation.
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8">{children}</main>
    );
  }

  return (
    <>
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 pb-24 sm:pb-8">{children}</main>

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
    </>
  );
}
