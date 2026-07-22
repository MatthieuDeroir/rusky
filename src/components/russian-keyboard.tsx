"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { transliterate } from "@/lib/translit";
import { Input } from "@/components/ui/input";

// The word (letters + soft/hard sign apostrophe) surrounding the caret, for transliteration.
function wordAt(text: string, caret: number): { start: number; end: number; token: string } | null {
  const isWord = (ch: string) => /[\p{L}']/u.test(ch);
  let start = caret;
  while (start > 0 && isWord(text[start - 1])) start--;
  let end = caret;
  while (end < text.length && isWord(text[end])) end++;
  if (start === end) return null;
  return { start, end, token: text.slice(start, end) };
}

interface Translit {
  start: number;
  end: number;
  items: string[];
}

const ROWS = [
  ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з", "х", "ъ"],
  ["ф", "ы", "в", "а", "п", "р", "о", "л", "д", "ж", "э"],
  ["я", "ч", "с", "м", "и", "т", "ь", "б", "ю", "ё"],
];

type RussianInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange"
> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Optional ref to the underlying input, e.g. to re-focus it (reopens the keyboard). */
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

export function RussianInput({
  value,
  onValueChange,
  onFocus,
  onBlur,
  readOnly,
  inputRef,
  ...props
}: RussianInputProps) {
  const internalRef = React.useRef<HTMLInputElement>(null);
  const ref = inputRef ?? internalRef;
  const [open, setOpen] = React.useState(false);
  const [translit, setTranslit] = React.useState<Translit | null>(null);
  const caret = React.useRef<number | null>(null);

  // Recompute Latin→Cyrillic suggestions for the word around the caret.
  function refreshTranslit(text: string, pos: number) {
    const w = wordAt(text, pos);
    if (w && /[a-z']/i.test(w.token)) {
      const items = transliterate(w.token);
      setTranslit(items.length ? { start: w.start, end: w.end, items } : null);
    } else {
      setTranslit(null);
    }
  }

  // Replace the Latin word under the caret with the chosen Cyrillic candidate.
  function chooseTranslit(cand: string) {
    if (!translit) return;
    const next = value.slice(0, translit.start) + cand + value.slice(translit.end);
    caret.current = translit.start + cand.length;
    setTranslit(null);
    onValueChange(next);
    ref.current?.focus();
  }

  // Restore the caret after a programmatic insertion re-renders the input.
  React.useLayoutEffect(() => {
    if (caret.current != null && ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });

  // The keyboard is a fixed bottom overlay; scroll the focused input toward the middle so
  // it isn't hidden behind the keyboard (no layout padding, so the footer stays in place).
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(
      () => ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }),
      50,
    );
    return () => clearTimeout(t);
  }, [open, ref]);

  function edit(producer: (text: string, start: number, end: number) => [string, number]) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const [next, pos] = producer(value, start, end);
    caret.current = pos;
    setTranslit(null); // inserted Cyrillic from the on-screen keyboard
    onValueChange(next);
    el?.focus();
  }

  const insert = (ch: string) =>
    edit((t, s, e) => [t.slice(0, s) + ch + t.slice(e), s + ch.length]);

  const backspace = () =>
    edit((t, s, e) => {
      if (s === e) {
        if (s === 0) return [t, 0];
        return [t.slice(0, s - 1) + t.slice(e), s - 1];
      }
      return [t.slice(0, s) + t.slice(e), s];
    });

  return (
    <div className="relative">
      <Input
        ref={ref}
        value={value}
        readOnly={readOnly}
        onChange={(e) => {
          onValueChange(e.target.value);
          if (!readOnly) refreshTranslit(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyUp={(e) => {
          // Track caret moves (arrows / click) so suggestions follow the edited word.
          if (!readOnly && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            const el = e.currentTarget;
            refreshTranslit(el.value, el.selectionStart ?? el.value.length);
          }
        }}
        onKeyDown={(e) => {
          if (translit) {
            if (e.key === "Enter") {
              // Accept the best Cyrillic suggestion instead of submitting the form.
              e.preventDefault();
              chooseTranslit(translit.items[0]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setTranslit(null);
            }
          }
        }}
        onFocus={(e) => {
          if (!readOnly) setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          // Keep open if focus moved into the keyboard panel or the suggestions menu.
          const next = e.relatedTarget as Node | null;
          if (!next || !e.currentTarget.parentElement?.contains(next)) {
            setOpen(false);
            setTranslit(null);
          }
          onBlur?.(e);
        }}
        {...props}
      />

      {translit && !readOnly && (
        <div
          className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-white/15 bg-[oklch(0.17_0.03_280)] shadow-[0_12px_40px_oklch(0.05_0.05_280/0.6)]"
          // Don't steal focus from the input when clicking a suggestion.
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-foreground/40">
            Cyrillique · Entrée pour valider
          </div>
          {translit.items.map((c, idx) => (
            <button
              key={c}
              type="button"
              onClick={() => chooseTranslit(c)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-xl text-foreground/90 transition-colors hover:bg-primary/40"
            >
              <span className="w-4 text-xs text-foreground/40">{idx + 1}</span>
              {c}
            </button>
          ))}
        </div>
      )}

      {open &&
        !readOnly &&
        typeof document !== "undefined" &&
        createPortal(
          // Portaled to <body> so `fixed` anchors to the viewport, not a glass ancestor
          // (backdrop-filter would otherwise trap fixed positioning inside the card).
          <div
            className="fixed inset-x-0 bottom-0 z-50 border-t border-white/15 bg-[oklch(0.17_0.03_280)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_40px_oklch(0.05_0.05_280/0.6)]"
            // Don't steal focus from the input when pressing keys.
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="mx-auto max-w-3xl space-y-2">
            {ROWS.map((row, i) => (
              <div key={i} className="flex justify-center gap-1.5 sm:gap-2">
                {row.map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => insert(ch)}
                    className="h-12 min-w-0 flex-1 rounded-lg bg-white/10 text-xl text-foreground/90 transition-colors hover:bg-primary/40 active:translate-y-px sm:h-14"
                  >
                    {ch}
                  </button>
                ))}
              </div>
            ))}
            <div className="flex justify-center gap-1.5 pt-0.5 sm:gap-2">
              <button
                type="button"
                onClick={() => insert(" ")}
                className="h-12 flex-[5] rounded-lg bg-white/10 text-sm text-foreground/70 transition-colors hover:bg-white/20"
              >
                espace
              </button>
              <button
                type="button"
                onClick={backspace}
                className="h-12 flex-1 rounded-lg bg-white/10 text-2xl text-foreground/80 transition-colors hover:bg-destructive/40"
                aria-label="Effacer"
              >
                ⌫
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  ref.current?.blur();
                }}
                className="h-12 flex-1 rounded-lg bg-primary/30 text-xl text-foreground transition-colors hover:bg-primary/50"
                aria-label="Fermer le clavier"
              >
                ✓
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}
