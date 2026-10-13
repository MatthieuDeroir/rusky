import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Config sans Prisma, partagée avec le proxy (qui ne doit pas charger la base).
export const authConfig = {
  providers: [Google],
  pages: { signIn: "/login" },
  trustHost: true,
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
