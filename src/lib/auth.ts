import NextAuth, { type Session } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

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
  ...authConfig,
  // The adapter persists User/Account rows (needed to scope data per user). It pulls in
  // Prisma/Node built-ins, so it lives here and NOT in the edge-safe authConfig.
  adapter: PrismaAdapter(prisma),
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
// AUTH_DEV_BYPASS=1 in .env + NODE_ENV=development → a session for the OWNER account, no
// Google round-trip needed. On Vercel NODE_ENV is "production" and the var is absent, so this
// branch is dead there.
//
// The bypass resolves to the REAL owner account (matched on OWNER_EMAIL), not a synthetic
// "dev-local" user: local and the deployed app share one Turso database, so they must also
// share one userId — otherwise each side would only ever see half the collection.
export const devBypass =
  process.env.AUTH_DEV_BYPASS === "1" && process.env.NODE_ENV === "development";

let devUserId: string | null = null;

/** The owner's user id, looked up once per process (created if the account doesn't exist yet). */
async function resolveDevUserId(): Promise<string> {
  if (devUserId) return devUserId;
  const existing = await prisma.user.findFirst({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  const id =
    existing?.id ??
    (await prisma.user.create({ data: { email: OWNER_EMAIL, name: "Owner" }, select: { id: true } }))
      .id;
  await ensureUserStats(id);
  await claimLegacyData(id);
  devUserId = id;
  return id;
}

async function devAuth(): Promise<Session> {
  const id = await resolveDevUserId();
  return {
    user: { id, name: "Dev (owner)", email: OWNER_EMAIL, image: null },
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
  if (devBypass) return resolveDevUserId();
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Not authenticated");
  return id;
}
