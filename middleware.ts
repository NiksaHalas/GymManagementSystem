import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

/**
 * Public routes that do not require authentication.
 * Everything else is protected; unauthenticated users are redirected to /login.
 */
const PUBLIC_PATHS = [
  "/login",
  "/zaboravljena-lozinka",
  "/reset",
  "/auth/callback",
  "/api/health",
  "/manifest.json",
  "/sw.js",
];

/** Auth pages for guests only — logged-in users are sent to the app. */
const GUEST_ONLY_AUTH_PATHS = ["/login", "/zaboravljena-lozinka"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  if (pathname.startsWith("/icons/")) return true;
  return false;
}

function isGuestOnlyAuthPath(pathname: string): boolean {
  return GUEST_ONLY_AUTH_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export async function middleware(request: NextRequest) {
  const { supabase, supabaseResponse } = createClient(request);

  // Always refresh the session — required by @supabase/ssr
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Redirect authenticated users away from login/forgot-password (not /reset or /auth/callback)
  if (user && isGuestOnlyAuthPath(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Redirect unauthenticated users to login
  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the intended destination so we can redirect back after login
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public static assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
