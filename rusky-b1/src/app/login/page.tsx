import { redirect } from "next/navigation";
import { auth, devBypass, signIn } from "@/lib/auth";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (devBypass || (await auth())?.user) redirect("/");
  return (
    <div className="flex min-h-[70vh] flex-col justify-center gap-8">
      <div className="space-y-2">
        <p className="ru text-[56px] leading-none font-semibold">Rusky</p>
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
