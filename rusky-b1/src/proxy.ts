import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);
const devBypass = process.env.AUTH_DEV_BYPASS === "1" && process.env.NODE_ENV === "development";

export default auth((req) => {
  if (devBypass) return NextResponse.next();
  const isLogin = req.nextUrl.pathname === "/login";
  if (!req.auth && !isLogin) return NextResponse.redirect(new URL("/login", req.nextUrl));
  if (req.auth && isLogin) return NextResponse.redirect(new URL("/", req.nextUrl));
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon|apple-icon|robots.txt|.*\\.(?:png|svg|ico|webmanifest|woff2?)).*)",
  ],
};
