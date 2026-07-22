import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

// The account whose email owns the pre-existing (legacy) data. On first login the
// unclaimed rows (userId NULL, or the "__legacy__" sentinel on state tables) are
// reassigned to this user, so Matthieu's progression survives the Vercel/Turso move.
export const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "matthieu.deroir@gmail.com";

export const LEGACY_SENTINEL = "__legacy__";

/**
 * Reassign every unclaimed legacy row to `userId`. Idempotent: once claimed there is
 * nothing left with a NULL / sentinel owner, so re-running is a no-op.
 */
export async function claimLegacyData(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.encounter.updateMany({ where: { userId: null }, data: { userId } }),
    prisma.quizAttempt.updateMany({ where: { userId: null }, data: { userId } }),
    prisma.levelProgress.updateMany({ where: { userId: LEGACY_SENTINEL }, data: { userId } }),
    prisma.torflProgress.updateMany({ where: { userId: LEGACY_SENTINEL }, data: { userId } }),
    prisma.recoCache.updateMany({ where: { userId: LEGACY_SENTINEL }, data: { userId } }),
    prisma.examItem.updateMany({ where: { userId: LEGACY_SENTINEL }, data: { userId } }),
  ]);
}

/** Ensure a UserStats row exists for a user (created lazily, never overwritten). */
export async function ensureUserStats(userId: string): Promise<void> {
  await prisma.userStats.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

const nextAuth = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT sessions so the middleware can gate routes on the edge without a DB round-trip.
  // The adapter still persists User/Account rows (needed to scope data per user).
  session: { strategy: "jwt" },
  providers: [Google],
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) session.user.id = token.id as string;
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (!user.id) return;
      await ensureUserStats(user.id);
      if (user.email && user.email.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
        await claimLegacyData(user.id);
      }
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;

/* ---------- Local dev bypass (impossible in production) ---------- */
// AUTH_DEV_BYPASS=1 in .env + NODE_ENV=development → a fake session, no Google needed.
// On Vercel NODE_ENV is "production" and the var is absent, so this branch is dead there.
export const devBypass =
  process.env.AUTH_DEV_BYPASS === "1" && process.env.NODE_ENV === "development";

const DEV_USER = {
  id: "dev-local",
  name: "Dev Local",
  email: OWNER_EMAIL,
  image: null,
};

let devSeeded = false;
async function ensureDevUser() {
  if (devSeeded) return;
  await prisma.user.upsert({
    where: { id: DEV_USER.id },
    update: {},
    create: { id: DEV_USER.id, name: DEV_USER.name, email: DEV_USER.email },
  });
  await ensureUserStats(DEV_USER.id);
  // In local dev, the dev user owns the legacy collection so the app is usable offline.
  await claimLegacyData(DEV_USER.id);
  devSeeded = true;
}

async function devAuth(): Promise<Session> {
  await ensureDevUser();
  return {
    user: DEV_USER,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  } as Session;
}

export const auth: typeof nextAuth.auth = devBypass
  ? (devAuth as unknown as typeof nextAuth.auth)
  : nextAuth.auth;

/**
 * The current user's id, or throw. Use inside server actions / server components that
 * require an authenticated user. Honours the dev bypass.
 */
export async function currentUserId(): Promise<string> {
  if (devBypass) {
    await ensureDevUser();
    return DEV_USER.id;
  }
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Not authenticated");
  return id;
}
