import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "known" | "wrong";
type Size = "md" | "lg" | "sm";

const VARIANT: Record<Variant, string> = {
  primary: "bg-cobalt text-cobalt-ink hover:brightness-110",
  secondary: "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-sunk",
  ghost: "text-muted hover:text-ink hover:bg-sunk",
  known: "bg-known text-white hover:brightness-110 dark:text-[#06150d]",
  wrong: "bg-surface text-wrong shadow-[inset_0_0_0_1px_var(--line)] hover:bg-wrong-soft",
};
const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 text-[15px] rounded-lg",
  md: "h-11 px-4 text-base rounded-xl",
  lg: "h-14 px-6 text-lg rounded-2xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/** Libellé de nature grammaticale court, en français. */
export const TYPE_FR: Record<string, string> = {
  noun: "nom",
  verb: "verbe",
  adjective: "adjectif",
  pronoun: "pronom",
  numeral: "numéral",
  other: "mot invariable",
};

export function wordMeta(w: { type: string; gender?: string | null; aspect?: string | null }) {
  const parts = [TYPE_FR[w.type] ?? w.type];
  if (w.type === "noun" && w.gender) parts.push({ m: "masculin", f: "féminin", n: "neutre" }[w.gender] ?? w.gender);
  if (w.type === "verb" && w.aspect) parts.push(w.aspect === "perfective" ? "perfectif" : "imperfectif");
  return parts.join(", ");
}
