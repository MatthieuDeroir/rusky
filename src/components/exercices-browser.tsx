"use client";

import { useState } from "react";
import Link from "next/link";
import { displayAccent } from "@/lib/grammar";
import type { ExerciseTheme } from "@/lib/queries";
import { ProgressRing } from "@/components/progress-ring";

// Map a theme key (verb-1, noun-2, adj-soft, pronoun…) to its grammatical type.
function typeOf(key: string): string {
  if (key.startsWith("noun")) return "noun";
  if (key.startsWith("verb")) return "verb";
  if (key.startsWith("adj")) return "adj";
  return key; // pronoun | numeral | other
}

const TYPE_ORDER = ["noun", "verb", "adj", "pronoun", "numeral", "other"];
const TYPE_LABEL: Record<string, string> = {
  noun: "Noms",
  verb: "Verbes",
  adj: "Adjectifs",
  pronoun: "Pronoms",
  numeral: "Numéraux",
  other: "Invariables",
};

// Short label for the sub-sub-tab (the part after "— ", e.g. "2e conjugaison").
function subLabel(label: string): string {
  const i = label.indexOf("—");
  return i >= 0 ? label.slice(i + 1).trim() : label;
}

export function ExercicesBrowser({ themes }: { themes: ExerciseTheme[] }) {
  const [selectedKey, setSelectedKey] = useState(themes[0]?.key ?? "");

  const types = TYPE_ORDER.filter((t) => themes.some((th) => typeOf(th.key) === t));
  const selectedType = typeOf(selectedKey);
  const themesOfType = themes.filter((th) => typeOf(th.key) === selectedType);
  const theme = themes.find((th) => th.key === selectedKey) ?? themes[0];
  if (!theme) return null;

  const discovered = theme.words.reduce((s, w) => s + w.discovered, 0);
  const total = theme.words.reduce((s, w) => s + w.total, 0);

  return (
    <div className="space-y-5">
      {/* Sub-tabs: grammatical type */}
      <div className="flex flex-wrap gap-1.5">
        {types.map((t) => {
          const active = t === selectedType;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setSelectedKey(themes.find((th) => typeOf(th.key) === t)!.key)}
              className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/15 text-foreground shadow-sm"
                  : "text-foreground/65 hover:bg-white/10 hover:text-foreground"
              }`}
            >
              {TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>

      {/* Sub-sub-tabs: declension / conjugation number within the type */}
      {themesOfType.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {themesOfType.map((th) => {
            const active = th.key === selectedKey;
            return (
              <button
                key={th.key}
                type="button"
                onClick={() => setSelectedKey(th.key)}
                className={`rounded-lg px-3 py-1.5 text-sm ring-1 transition-colors ${
                  active
                    ? "bg-primary/25 text-foreground ring-primary/40"
                    : "bg-white/5 text-foreground/60 ring-transparent hover:bg-white/10"
                }`}
              >
                {subLabel(th.label)}
                <span className="ml-1.5 text-xs text-foreground/40">{th.words.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected theme: progress + exercise actions + word list */}
      <section className="glass rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {total > 0 && <ProgressRing value={discovered} total={total} size={44} />}
            <div>
              <h2 className="font-medium">{theme.label}</h2>
              <p className="text-xs text-foreground/55">
                {theme.words.length} mot{theme.words.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          {total > 0 && (
            <div className="flex flex-wrap gap-2">
              {[
                ["/quiz", "Pratiquer"],
                ["/complete", "Compléter"],
                ["/translate", "Traduire"],
              ].map(([href, label]) => (
                <Link
                  key={href}
                  href={`${href}?theme=${theme.key}`}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/20"
                >
                  {label}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {theme.words.map((w) => {
            const done = w.total > 0 && w.discovered >= w.total;
            return (
              <Link
                key={w.id}
                href={`/word/${w.id}?theme=${theme.key}`}
                className={`glass-lift flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-white/10 ${
                  done ? "bg-white/[0.02] opacity-45" : "bg-white/5"
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-display text-lg">{displayAccent(w.accented)}</div>
                  {w.translationsFr && (
                    <div className="truncate text-xs text-foreground/55">{w.translationsFr}</div>
                  )}
                </div>
                {w.total > 0 && (
                  <span
                    className={`ml-2 shrink-0 text-xs tabular-nums ${
                      done ? "text-emerald-300/70" : "text-foreground/45"
                    }`}
                  >
                    {w.discovered}/{w.total}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
