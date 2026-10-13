"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Accueil / Séance / Lire / Mots / Profil (+ le CTA "Aujourd'hui" à part) — pivot « Lire » (v3).
// Exercices, Objectif B1 et les ressources vivent sous Profil.
const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Accueil" },
  { href: "/seance", label: "Séance" },
  { href: "/lire", label: "Lire" },
  { href: "/collection", label: "Mots" },
  { href: "/profil", label: "Profil" },
];

export function NavLinks() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex items-center gap-1">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
            isActive(item.href)
              ? "bg-white/15 text-foreground shadow-sm"
              : "text-foreground/70 hover:bg-white/10 hover:text-foreground"
          }`}
        >
          {item.label}
        </Link>
      ))}

      {/* Highlighted call-to-action, distinct from the navigation tabs. */}
      <Link
        href="/jour"
        className={`ml-1 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
          isActive("/jour")
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-primary/90 text-primary-foreground hover:bg-primary"
        }`}
      >
        Aujourd’hui
      </Link>
    </div>
  );
}
