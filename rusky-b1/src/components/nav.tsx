"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LibraryBig, Sun, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Aujourd’hui", icon: Sun },
  { href: "/mots", label: "Mots", icon: LibraryBig },
  { href: "/lire", label: "Lire", icon: BookOpen },
  { href: "/progres", label: "Progrès", icon: TrendingUp },
];

export function Nav() {
  const path = usePathname();
  if (path === "/login" || path.startsWith("/seance")) return null;
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      {/* Desktop : barre en haut */}
      <header className="fixed inset-x-0 top-0 z-40 hidden border-b border-line bg-paper/90 backdrop-blur sm:block">
        <nav className="mx-auto flex max-w-2xl items-center gap-1 px-4 py-3">
          <Link href="/" className="mr-auto rounded-xl" aria-label="Rusky, accueil">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG statique, pas d'optimisation utile */}
            <img src="/logo.svg" alt="Rusky" width={48} height={48} className="size-12" />
          </Link>
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active(t.href) ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[15px] text-muted transition-colors hover:text-ink",
                active(t.href) && "bg-surface text-ink shadow-[0_0_0_1px_var(--line)]",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Mobile : onglets en bas */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map((t) => {
            const on = active(t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={cn("flex flex-col items-center gap-0.5 py-2.5 text-[12px]", on ? "text-cobalt" : "text-muted")}
                >
                  <t.icon className="size-[22px]" strokeWidth={on ? 2.2 : 1.8} />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
