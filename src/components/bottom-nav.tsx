"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Route, Dumbbell, Plus, BookOpen, GraduationCap, User } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Accueil", icon: Home, exact: true },
  { href: "/parcours", label: "Parcours", icon: Route },
  { href: "/exercices", label: "Exercices", icon: Dumbbell },
  { href: "/add", label: "Ajouter", icon: Plus, central: true },
  { href: "/reference", label: "Référence", icon: BookOpen },
  { href: "/validation", label: "Validation", icon: GraduationCap },
  { href: "/profil", label: "Profil", icon: User },
] as const;

// Mobile-only bottom navigation (Duolingo-style). Desktop keeps the top glass nav.
export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-background/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] sm:hidden">
      <div className="mx-auto flex h-16 w-full max-w-xl items-center px-0.5">
        {ITEMS.map(({ href, label, icon: Icon, ...rest }) => {
          const active = isActive(href, "exact" in rest ? rest.exact : undefined);
          const central = "central" in rest && rest.central;

          if (central) {
            return (
              <div key={href} className="flex flex-1 justify-center">
                <Link href={href} aria-label={label} className="-mt-6">
                  <span className="grid size-13 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-4 ring-[var(--background)] transition-transform active:scale-95">
                    <Icon className="size-[22px]" strokeWidth={2.3} />
                  </span>
                </Link>
              </div>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[9px] font-medium leading-tight transition-colors ${
                active ? "text-primary" : "text-foreground/55 hover:text-foreground"
              }`}
            >
              {active && <span className="absolute -top-0.5 h-1 w-6 rounded-full bg-primary" />}
              <Icon className="size-5" strokeWidth={active ? 2.3 : 1.8} />
              <span className="w-full truncate text-center">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
