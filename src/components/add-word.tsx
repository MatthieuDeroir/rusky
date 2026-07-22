"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import {
  addEncounterAction,
  detectSentenceAction,
  type DetectedWord,
} from "@/app/actions";
import type { DetectionMatch } from "@/lib/detect";
import { displayAccent } from "@/lib/grammar";
import { getRecognitionCtor, noopSubscribe, type Recognition } from "@/lib/speech";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RussianInput } from "@/components/russian-keyboard";

function matchId(m: DetectionMatch) {
  return `${m.entryId}|${m.formKey ?? "base"}`;
}

export function AddWord() {
  const [word, setWord] = useState("");
  const [groups, setGroups] = useState<DetectedWord[] | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<Recognition | null>(null);

  // Client-only speech-recognition support (no hydration mismatch / setState-in-effect).
  const micSupported = useSyncExternalStore(
    noopSubscribe,
    () => getRecognitionCtor() !== null,
    () => false,
  );

  useEffect(() => () => recRef.current?.stop(), []);

  // Single detection pipeline for typed AND dictated text (debounced).
  function runDetect(value: string) {
    if (debounce.current) clearTimeout(debounce.current);
    const q = value.trim();
    if (!q) {
      setGroups(null);
      return;
    }
    debounce.current = setTimeout(() => {
      startSearch(async () => {
        setGroups(await detectSentenceAction(q));
      });
    }, 300);
  }

  function onChangeWord(value: string) {
    setInterim("");
    setWord(value);
    runDetect(value);
  }

  // --- Voice dictation: appends final transcript into the same field ----------------
  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "ru-RU";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let fin = "";
      let intm = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else intm += r[0].transcript;
      }
      if (fin) {
        setInterim("");
        setWord((prev) => {
          const next = (prev ? prev + " " : "") + fin.trim();
          runDetect(next);
          return next;
        });
      } else {
        setInterim(intm);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast.error("Micro refusé. Autorise l’accès au microphone.");
      }
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function stopListening() {
    recRef.current?.stop();
    setListening(false);
    // Quitting the dictation clears the transcribed phrase.
    reset();
  }

  function reset() {
    setWord("");
    setGroups(null);
    setInterim("");
  }

  const allMatches = groups?.flatMap((g) => g.matches) ?? [];
  const addable = allMatches.filter((m) => !m.alreadyAdded);
  const singleToken = word.trim().split(/\s+/).filter(Boolean).length <= 1;
  const noMatch = groups !== null && !isSearching && allMatches.length === 0;

  function save(src: DetectedWord[] | null = groups) {
    if (!src) return;
    const toAddAny = src.flatMap((g) => g.matches).some((m) => !m.alreadyAdded);
    if (!toAddAny) return;
    startSave(async () => {
      let addedWords = 0;
      for (const g of src) {
        const toAdd = g.matches.filter((m) => !m.alreadyAdded);
        if (toAdd.length === 0) continue;
        for (const m of toAdd) {
          await addEncounterAction({
            entryId: m.entryId,
            rawInput: g.raw,
            matchedFormKey: m.formKey,
          });
        }
        addedWords += 1;
      }
      const lastEntryId = src.at(-1)?.matches.at(-1)?.entryId ?? null;
      toast.success(
        addedWords === 1 ? "1 mot ajouté." : `${addedWords} mots ajoutés.`,
        addedWords === 1 && lastEntryId
          ? {
              action: {
                label: "Voir le tableau",
                onClick: () => {
                  window.location.href = `/word/${lastEntryId}`;
                },
              },
            }
          : undefined,
      );
      // Clear the transcript but keep dictating (the mic stays on). When typing,
      // refocus the field to chain words; while listening, don't steal focus.
      reset();
      if (!listening) setTimeout(() => wordRef.current?.focus(), 0);
    });
  }

  // Add button / Enter: use current matches, or detect first if the debounce hasn't fired yet.
  function submitAdd() {
    if (isSaving) return;
    const q = word.trim();
    if (!q) return;
    if (groups) {
      if (addable.length > 0) save();
      else if (noMatch && singleToken) saveUnmatched();
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    startSearch(async () => {
      const g = await detectSentenceAction(q);
      setGroups(g);
      const addableNow = g.flatMap((x) => x.matches).filter((m) => !m.alreadyAdded);
      if (addableNow.length > 0) save(g);
    });
  }

  function saveUnmatched() {
    startSave(async () => {
      await addEncounterAction({
        entryId: null,
        rawInput: word.trim(),
        matchedFormKey: null,
      });
      toast.success(`« ${word.trim()} » enregistré (à classer plus tard).`);
      reset();
    });
  }

  return (
    <div className="space-y-6">
      <div className="glass-strong rounded-3xl p-6">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="word" className="text-foreground/70">
            Mot ou phrase rencontré
          </Label>
          {micSupported && (
            <Button
              type="button"
              size="sm"
              variant={listening ? "destructive" : "secondary"}
              onClick={listening ? stopListening : startListening}
              className="gap-2"
            >
              {listening ? (
                <>
                  <Square className="h-3.5 w-3.5" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
                  Arrêter
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5" />
                  Dicter
                </>
              )}
            </Button>
          )}
        </div>
        {/* Enter submits the form (unless a Cyrillic suggestion is open — handled by RussianInput). */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitAdd();
          }}
          className="mt-2 flex items-stretch gap-2"
        >
          <RussianInput
            id="word"
            inputRef={wordRef}
            value={word}
            onValueChange={onChangeWord}
            placeholder="ex. книги, читал…"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="h-14 flex-1 border-white/15 bg-white/5 text-2xl"
          />
          <Button
            type="submit"
            size="lg"
            disabled={isSaving || !word.trim()}
            className="h-14 shrink-0 px-5"
          >
            {isSaving ? "…" : "Ajouter"}
          </Button>
        </form>
        {interim && (
          <p className="mt-1 px-1 text-sm italic text-foreground/40">{interim}…</p>
        )}
      </div>

      {isSearching && <p className="text-center text-sm text-foreground/50">Analyse…</p>}

      {noMatch && (
        <div className="glass rounded-2xl p-6 text-center">
          <p className="text-foreground/70">
            {singleToken
              ? `Aucune correspondance trouvée pour « ${word.trim()} ».`
              : "Aucun mot reconnu dans la phrase."}
          </p>
          {singleToken && (
            <Button
              variant="secondary"
              className="mt-4"
              onClick={saveUnmatched}
              disabled={isSaving}
            >
              Enregistrer quand même
            </Button>
          )}
        </div>
      )}

      {groups && allMatches.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-foreground/60">
            {groups.length === 1
              ? "Interprétation(s) détectée(s) :"
              : `${groups.length} mots détectés — toutes les formes nouvelles seront ajoutées :`}
          </p>

          {groups.map((g) => (
            <div key={g.norm} className="space-y-2">
              {groups.length > 1 && (
                <div className="px-1 text-xs uppercase tracking-wide text-foreground/40">
                  {g.raw}
                  {g.matches.length === 0 && " · inconnu"}
                </div>
              )}
              {g.matches.length === 0 && groups.length > 1 ? (
                <div className="glass rounded-2xl px-5 py-3 text-sm text-foreground/40">
                  Mot introuvable au dictionnaire.
                </div>
              ) : (
                g.matches.map((m) => (
                  <div
                    key={matchId(m)}
                    className={`glass flex items-center justify-between rounded-2xl px-5 py-4 ring-1 transition-colors ${
                      m.alreadyAdded
                        ? "bg-emerald-400/10 ring-emerald-400/40"
                        : m.lemmaCollected
                          ? "bg-amber-400/10 ring-amber-400/30"
                          : "ring-transparent"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-semibold">
                          {displayAccent(m.formAccented)}
                        </span>
                        <Badge variant="secondary" className="bg-white/10">
                          {m.typeLabel}
                        </Badge>
                        {m.alreadyAdded ? (
                          <Badge className="border-emerald-400/40 bg-emerald-400/20 text-emerald-200">
                            ✓ déjà ajouté
                          </Badge>
                        ) : m.lemmaCollected ? (
                          <Badge className="border-amber-400/40 bg-amber-400/20 text-amber-200">
                            nouvelle forme
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 text-sm text-foreground/70">
                        {m.formLabel} · de{" "}
                        <span className="font-medium">{displayAccent(m.accented)}</span>
                        {m.translationsFr ? (
                          <span className="text-foreground/50"> — {m.translationsFr}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}

          <div className="pt-2">
            <Button
              onClick={() => save()}
              disabled={isSaving || addable.length === 0}
              size="lg"
              className="w-full sm:ml-auto sm:w-auto"
            >
              {isSaving
                ? "Ajout…"
                : addable.length === 0
                  ? "Déjà dans ta collection"
                  : addable.length > 1
                    ? `Ajouter ${addable.length} formes`
                    : "Ajouter à ma collection"}
            </Button>
          </div>
        </div>
      )}

      {groups === null && !isSearching && (
        <p className="text-center text-sm text-foreground/50">
          Tape un mot russe — ou dicte une phrase entière — l’app détecte la nature, le cas /
          la forme, puis remplit la bonne case de chaque tableau.{" "}
          <Link href="/" className="underline underline-offset-2">
            Voir mes mots
          </Link>
        </p>
      )}
    </div>
  );
}
