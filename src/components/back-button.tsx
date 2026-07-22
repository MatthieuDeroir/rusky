"use client";

import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="text-sm text-foreground/50 hover:text-foreground/80"
    >
      ← Retour
    </button>
  );
}
