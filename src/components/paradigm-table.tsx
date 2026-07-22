"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { fillCellAction } from "@/app/actions";
import { displayAccent, normalizeBare, stripStress } from "@/lib/grammar";
import type { ParadigmCellData, RenderedSection } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { RussianInput } from "@/components/russian-keyboard";
import { SpeakButton } from "@/components/speak-button";

// When each Russian case is used — shown on hover over the case name.
const CASE_USAGE: Record<string, string> = {
  Nominatif: "Sujet de la phrase (qui ? quoi ?). C’est la forme du dictionnaire.",
  Accusatif:
    "Complément d’objet direct — « qui ? quoi ? » (вижу что). La direction après в / на (куда ?).",
  Génitif:
    "Possession (« de »), négation/absence (нет…), quantités, et après beaucoup de prépositions (без, у, для, от, до, из…).",
  Datif:
    "Destinataire — « à qui ? » (дать кому). Après к et по ; avec нравиться, помогать, et les tournures impersonnelles (мне нужно).",
  Instrumental:
    "Le moyen/l’instrument — « avec quoi ? » (писать чем). Après с (« avec »), et l’attribut de быть/стать.",
  Prépositionnel:
    "Toujours après une préposition : lieu (в, на — где ?), le sujet « à propos de » (о / об), при.",
};

function CaseLabel({ label }: { label: string }) {
  const usage = CASE_USAGE[label];
  if (!usage)
    return <span className="text-sm text-foreground/60">{label}</span>;
  return (
    <span className="group/case relative cursor-help border-b border-dotted border-foreground/30 text-sm text-foreground/80">
      {label}
      <span className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-60 origin-top-left translate-y-1 rounded-xl border border-white/15 bg-[oklch(0.2_0.02_70)] p-3 text-xs font-normal leading-relaxed text-foreground/85 opacity-0 shadow-2xl shadow-black/50 transition-all duration-150 group-hover/case:translate-y-0 group-hover/case:opacity-100">
        {usage}
      </span>
    </span>
  );
}

/**
 * The stem/radical shared by (almost) all the word's forms. We tolerate ONE deviating form so a
 * single consonant mutation — e.g. the 1st pers. sg. of a 2nd-conj verb (проси́ть → прошу́), or
 * the masculine past — doesn't shorten the stem for everyone else (прос-, not про-). Matching is
 * accent- and ё/е-insensitive, but the returned letters come from a real form (keeps ё).
 */
function commonStem(forms: string[]): string {
  const items = forms
    .map((f) => ({ folded: normalizeBare(f), real: stripStress(f).toLowerCase() }))
    .filter((x) => x.folded.length > 0);
  const n = items.length;
  if (n < 2) return "";
  const threshold = n <= 2 ? n : n - 1; // a prefix shared by all but one form
  const maxLen = Math.max(...items.map((i) => i.folded.length));
  for (let len = maxLen; len >= 2; len--) {
    const counts = new Map<string, number>();
    for (const it of items) {
      if (it.folded.length < len) continue;
      const p = it.folded.slice(0, len);
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestC = 0;
    for (const [p, c] of counts) {
      if (c >= threshold && c > bestC) {
        best = p;
        bestC = c;
      }
    }
    if (best) {
      const src = items.find((it) => it.folded.startsWith(best!))!;
      return src.real.slice(0, len);
    }
  }
  return "";
}

/** Prefill for ONE declension cell: the part of the section stem this form starts with, so a
 * mutated form keeps only the shared prefix. */
function cellPrefill(stem: string, cellForm: string | undefined): string {
  if (!stem || !cellForm) return "";
  const s = normalizeBare(stem);
  const c = normalizeBare(cellForm);
  let i = 0;
  while (i < s.length && i < c.length && s[i] === c[i]) i++;
  return i >= 2 ? stem.slice(0, i) : "";
}

// Personal/gender/imperative endings, per verb formKey (longest variants first). Used to strip
// each conjugated form down to its OWN stem, so mutations show through (рожу́сь → рож, прошу́ →
// прош) instead of a too-short shared prefix.
const VERB_ENDINGS: Record<string, RegExp> = {
  presfut_sg1: /(ю|у)$/,
  presfut_sg2: /(ешь|ёшь|ишь)$/,
  presfut_sg3: /(ет|ёт|ит)$/,
  presfut_pl1: /(ем|ём|им)$/,
  presfut_pl2: /(ете|ёте|ите)$/,
  presfut_pl3: /(ут|ют|ат|ят)$/,
  past_m: /л$/,
  past_f: /ла$/,
  past_n: /ло$/,
  past_pl: /ли$/,
  imperative_sg: /(й|и|ь)$/,
  imperative_pl: /(йте|ите|ьте)$/,
};

/** Per-cell radical: strip stress, reflexive -ся/-сь, then the ending for this exact form. */
function stripVerbEnding(formKey: string, cellForm: string): string {
  const re = VERB_ENDINGS[formKey];
  if (!re) return "";
  const base = stripStress(cellForm).toLowerCase().replace(/(ся|сь)$/, "");
  const stem = base.replace(re, "");
  return stem.length >= 2 ? stem : "";
}

/** Radical to prefill for a cell: per-form ending strip for verbs, shared-stem prefix otherwise. */
function prefillFor(formKey: string, cellForm: string | undefined, sectionStem: string): string {
  if (!cellForm) return "";
  if (/^(presfut_|past_|imperative_)/.test(formKey)) return stripVerbEnding(formKey, cellForm);
  return cellPrefill(sectionStem, cellForm);
}

function Cell({
  cell,
  entryId,
  revealAll,
  stem,
  autoEdit,
  onCommit,
}: {
  cell: ParadigmCellData | null;
  entryId: number;
  revealAll: boolean;
  stem: string;
  autoEdit: boolean;
  onCommit: (formKey: string) => void;
}) {
  const [discovered, setDiscovered] = useState(cell?.discovered ?? false);
  const [mode, setMode] = useState<"idle" | "editing">("idle");
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);
  const [peek, setPeek] = useState(false);
  const [prevAutoEdit, setPrevAutoEdit] = useState(autoEdit);
  const [, startSave] = useTransition();

  // When the previous cell is validated the parent points autoEdit here → open this cell in
  // edit mode. Done as an "adjust state on prop change during render" (not an effect).
  if (autoEdit !== prevAutoEdit) {
    setPrevAutoEdit(autoEdit);
    if (autoEdit && mode === "idle" && !discovered && (cell?.variants.length ?? 0) > 0) {
      if (cell) setValue(prefillFor(cell.formKey, cell.variants[0], stem));
      setPeek(false);
      setMode("editing");
    }
  }

  if (!cell) return <td className="p-2" />;
  const hasData = cell.variants.length > 0;
  const display = cell.variants.map((v) => displayAccent(v)).join(" / ");
  const showValue = discovered || revealAll;

  function commit(answer: string) {
    setDiscovered(true);
    setMode("idle");
    setWrong(false);
    setPeek(false);
    startSave(async () => {
      await fillCellAction({ entryId, formKey: cell!.formKey, answer });
    });
    onCommit(cell!.formKey); // advance focus to the next blank cell
  }

  // Auto-validate: as soon as the typed form matches the reference, commit it.
  function onChange(v: string) {
    setValue(v);
    setWrong(false);
    if (cell!.variants.some((x) => normalizeBare(x) === normalizeBare(v))) {
      commit(v);
    }
  }

  return (
    <td className="p-2 align-top">
      {showValue ? (
        <div
          className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-lg ${
            discovered
              ? "bg-primary/20 ring-1 ring-primary/40"
              : "bg-white/5 text-foreground/70"
          }`}
        >
          <span>{hasData ? display : "—"}</span>
          {hasData && <SpeakButton text={cell.variants[0]} />}
        </div>
      ) : mode === "editing" ? (
        <div className="space-y-1">
          <RussianInput
            value={value}
            onValueChange={onChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Auto-commits on match while typing; Enter handles the prefilled-stem
                // case and flags a non-match.
                if (cell!.variants.some((x) => normalizeBare(x) === normalizeBare(value)))
                  commit(value);
                else setWrong(true);
              }
              if (e.key === "Escape") {
                setPeek(false);
                setMode("idle");
              }
            }}
            placeholder="forme…"
            autoFocus
            spellCheck={false}
            className={`h-9 bg-white/5 text-center ${
              wrong ? "border-red-400/70 ring-2 ring-red-400/40" : "border-white/15"
            }`}
          />
          <div className="flex items-center justify-between gap-1 px-0.5">
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setPeek((p) => !p)}
                className="text-xs text-foreground/40 hover:text-foreground/70 hover:underline"
              >
                voir
              </button>
              {peek && (
                <div className="absolute bottom-full left-0 z-30 mb-1.5 flex w-max max-w-[14rem] items-center gap-1.5 rounded-lg border border-white/15 bg-[oklch(0.2_0.02_70)] px-3 py-1.5 text-sm text-foreground/90 shadow-2xl shadow-black/50">
                  <span>{hasData ? display : "—"}</span>
                  {hasData && <SpeakButton text={cell.variants[0]} />}
                </div>
              )}
            </div>
            {wrong && <span className="text-xs text-red-300">pas encore</span>}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (!hasData) return;
            setValue(prefillFor(cell.formKey, cell.variants[0], stem)); // radical de cette forme
            setPeek(false);
            setMode("editing");
          }}
          disabled={!hasData}
          className="w-full rounded-xl border border-dashed border-white/20 px-3 py-2 text-center text-sm text-foreground/40 transition-colors hover:border-primary/50 hover:text-foreground/80 disabled:opacity-40"
          title={hasData ? "Saisir cette forme" : "Forme inexistante"}
        >
          {hasData ? "saisir" : "—"}
        </button>
      )}
    </td>
  );
}

export function ParadigmTable({
  sections,
  entryId,
}: {
  sections: RenderedSection[];
  entryId: number;
}) {
  const [revealAll, setRevealAll] = useState(false);
  // Focus chaining: the formKey whose cell should auto-open in edit mode (set after a commit).
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const filled = useRef<Set<string>>(new Set());

  // All fillable cells (with reference data) in display order, + those already discovered.
  const { order, discoveredInit } = useMemo(() => {
    const order: string[] = [];
    const discoveredInit = new Set<string>();
    for (const s of sections)
      for (const r of s.rows)
        for (const c of r.cells)
          if (c && c.variants.length > 0) {
            order.push(c.formKey);
            if (c.discovered) discoveredInit.add(c.formKey);
          }
    return { order, discoveredInit };
  }, [sections]);

  function advance(formKey: string) {
    filled.current.add(formKey);
    const start = order.indexOf(formKey);
    for (let i = start + 1; i < order.length; i++) {
      const k = order[i];
      if (!discoveredInit.has(k) && !filled.current.has(k)) {
        setActiveKey(k);
        return;
      }
    }
    setActiveKey(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-foreground/60">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded bg-primary/40 ring-1 ring-primary/50" />
            Découvert
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded border border-dashed border-white/30" />
            À saisir
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRevealAll((v) => !v)}
          className="bg-white/10"
        >
          {revealAll ? "Masquer les réponses" : "Tout révéler"}
        </Button>
      </div>

      {sections.map((section) => {
        // Shared stem for DECLENSION sections (verb sections strip per-cell in prefillFor).
        const stem = commonStem(
          section.rows.flatMap((r) => r.cells.flatMap((c) => c?.variants ?? [])),
        );
        return (
        <div key={section.title} className="glass rounded-2xl p-4">
          <h3 className="mb-3 px-1 text-sm font-medium text-foreground/70">
            {section.title}
          </h3>
          {section.rule.length > 0 && (
            <details className="group mb-3 rounded-xl bg-white/5 px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-foreground/60 hover:text-foreground">
                <span>Règle</span>
                <span className="text-foreground/40 transition-transform group-open:rotate-180">
                  ⌄
                </span>
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-foreground/80">
                {section.rule.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>{displayAccent(line)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <table className="w-full border-collapse">
            {section.columns.length > 0 && (
              <thead>
                <tr>
                  <th className="w-32 p-2" />
                  {section.columns.map((c) => (
                    <th
                      key={c}
                      className="p-2 text-center text-xs font-medium uppercase tracking-wide text-foreground/50"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {section.rows.map((row) => (
                <tr key={row.label}>
                  <th className="p-2 text-left font-normal">
                    <CaseLabel label={row.label} />
                  </th>
                  {row.cells.map((cell, i) => (
                    <Cell
                      key={i}
                      cell={cell}
                      entryId={entryId}
                      revealAll={revealAll}
                      stem={stem}
                      autoEdit={!!cell && activeKey === cell.formKey}
                      onCommit={advance}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        );
      })}
    </div>
  );
}
