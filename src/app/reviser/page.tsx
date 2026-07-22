import { ReviserCard } from "@/components/reviser-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Réviser · Русский" };

export default function ReviserPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Réviser</h1>
        <p className="text-sm text-foreground/55">
          Révisions espacées : rappelle-toi les formes que tu as découvertes, au bon moment.
        </p>
      </div>
      <ReviserCard />
    </div>
  );
}
