"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Tabs grouped into categories; multi-item categories open a dropdown, single-item ones are a
// plain link. The "Ajouter" CTA is rendered separately (highlighted) after these.
const NAV: { label: string; items: { href: string; label: string }[] }[] = [
  { label: "Collection", items: [{ href: "/", label: "Collection" }] },
  { label: "Parcours", items: [{ href: "/parcours", label: "Parcours" }] },
  { label: "Exercices", items: [{ href: "/exercices", label: "Vue d’ensemble" }] },
  {
    label: "Référence",
    items: [
      { href: "/reference", label: "Ressources officielles" },
      { href: "/cas", label: "Cas" },
      { href: "/chiffres", label: "Chiffres" },
    ],
  },
  { label: "Validation", items: [{ href: "/validation", label: "Validation" }] },
  { label: "Profil", items: [{ href: "/profil", label: "Profil" }] },
];

export function NavLinks() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex items-center gap-1">
      {NAV.map((cat) => {
        const active = cat.items.some((i) => isActive(i.href));

        // Single-item category → a plain link (no dropdown).
        if (cat.items.length === 1) {
          const item = cat.items[0];
          return (
            <Link
              key={cat.label}
              href={item.href}
              className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/15 text-foreground shadow-sm"
                  : "text-foreground/70 hover:bg-white/10 hover:text-foreground"
              }`}
            >
              {cat.label}
            </Link>
          );
        }

        return (
          <div
            key={cat.label}
            className="relative"
            onMouseEnter={() => setOpen(cat.label)}
            onMouseLeave={() => setOpen((o) => (o === cat.label ? null : o))}
          >
            <button
              type="button"
              onClick={() => setOpen((o) => (o === cat.label ? null : cat.label))}
              className={`flex items-center gap-1 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/15 text-foreground shadow-sm"
                  : "text-foreground/70 hover:bg-white/10 hover:text-foreground"
              }`}
            >
              {cat.label}
              <ChevronDown
                className={`size-3.5 transition-transform ${
                  open === cat.label ? "rotate-180" : ""
                }`}
              />
            </button>

            {open === cat.label && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-44 overflow-hidden rounded-xl border border-white/15 bg-[oklch(0.17_0.03_280)] p-1 shadow-[0_12px_40px_oklch(0.05_0.05_280/0.6)]">
                {cat.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(null)}
                    className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive(item.href)
                        ? "bg-white/15 text-foreground"
                        : "text-foreground/70 hover:bg-white/10 hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Highlighted call-to-action, distinct from the navigation tabs. */}
      <Link
        href="/add"
        className={`ml-1 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
          isActive("/add")
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-primary/90 text-primary-foreground hover:bg-primary"
        }`}
      >
        + Ajouter
      </Link>
    </div>
  );
}
