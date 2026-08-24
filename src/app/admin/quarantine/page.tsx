import { BackButton } from "@/components/back-button";
import { QuarantineView } from "@/components/quarantine-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quarantaine · Admin · Русский" };

export default function QuarantinePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-semibold">Quarantaine</h1>
        <p className="text-sm text-foreground/55">
          Items où le solveur (passe 6) n’est pas d’accord avec la clé — à trancher à la main.
        </p>
      </div>
      <QuarantineView />
    </div>
  );
}
