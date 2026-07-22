import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Local dev bypass: skip all auth gating so the app is usable without Google.
const devBypass =
  process.env.AUTH_DEV_BYPASS === "1" && process.env.NODE_ENV === "development";

export default auth((req) => {
  if (devBypass) return;

  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isLogin = pathname === "/login";

  if (!isLoggedIn && !isLogin) {
    const url = new URL("/login", req.nextUrl);
    return NextResponse.redirect(url);
  }
  if (isLoggedIn && isLogin) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  // Gate everything except Next internals, the auth API, and static/PWA assets.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon|apple-icon|robots.txt|.*\\.(?:png|svg|ico|webmanifest|woff2?)).*)",
  ],
};
