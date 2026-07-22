import { Logo } from "@/components/logo";

// Shown instantly on navigation (Suspense fallback) so the app never freezes while a page's
// data streams in — the dome pulses and gold dots bounce, then the page swaps in.
export default function Loading() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <div role="status" aria-label="Chargement" className="flex flex-col items-center gap-4">
        <Logo size={44} className="animate-pulse text-primary" />
        <div className="flex items-center gap-1.5">
          <span className="size-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
          <span className="size-2 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.15s]" />
          <span className="size-2 animate-bounce rounded-full bg-primary/40" />
        </div>
      </div>
    </div>
  );
}
