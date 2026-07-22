import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe Auth.js config: NO Prisma adapter, NO Node built-ins. Shared by the middleware
// (Edge runtime) and the full server-side auth (which adds the Prisma adapter + events).
export const authConfig = {
  providers: [Google],
  pages: { signIn: "/login" },
  // JWT sessions so the middleware can authorize on the edge without a DB round-trip.
  session: { strategy: "jwt" },
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
} satisfies NextAuthConfig;
