import { redirect } from "next/navigation";
import { auth, devBypass, signIn } from "@/lib/auth";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (devBypass || (await auth())?.user) redirect("/");
  return (
    <div className="flex min-h-[70vh] flex-col justify-center gap-8">
      <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG statique, pas d'optimisation utile */}
        <img src="/logo.svg" alt="Rusky" width={128} height={128} className="size-32" />
        <p className="text-[19px] text-muted">Le lexique B1 et la lecture, un peu chaque jour, jusqu’au ТРКИ-1.</p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <Button type="submit" size="lg">
          Continuer avec Google
        </Button>
      </form>
    </div>
  );
}
