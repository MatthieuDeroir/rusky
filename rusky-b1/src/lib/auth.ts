import "server-only";
import NextAuth, { type Session } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

export const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "matthieu.deroir@gmail.com";

const nextAuth = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  events: {
    async signIn({ user }) {
      if (user.id) await prisma.settings.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;

/* Contournement local (impossible en prod : NODE_ENV y vaut "production") : session du compte
 * propriétaire sans aller-retour Google. */
export const devBypass = process.env.AUTH_DEV_BYPASS === "1" && process.env.NODE_ENV === "development";

let devUser: Promise<string> | null = null;

/** Id du propriétaire, cherché une seule fois par processus. On mémoïse la PROMESSE : des
 * requêtes parallèles au démarrage ne relancent pas chacune la recherche. */
function devUserId(): Promise<string> {
  devUser ??= (async () => {
    const u =
      (await prisma.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } })) ??
      (await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Owner" }, select: { id: true } }));
    return u.id;
  })().catch((e) => {
    devUser = null;
    throw e;
  });
  return devUser;
}

export const auth: typeof nextAuth.auth = devBypass
  ? ((async () =>
      ({
        user: { id: await devUserId(), email: OWNER_EMAIL, name: "Dev" },
        expires: new Date(Date.now() + 86_400_000).toISOString(),
      }) as Session) as unknown as typeof nextAuth.auth)
  : nextAuth.auth;

/** L'utilisateur courant, ou une erreur. */
export async function currentUserId(): Promise<string> {
  if (devBypass) return devUserId();
  const id = (await nextAuth.auth())?.user?.id;
  if (!id) throw new Error("Non connecté");
  return id;
}
