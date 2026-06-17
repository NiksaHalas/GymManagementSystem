import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

const DEV = process.env.NODE_ENV === "development";

const OTP_TYPES = new Set<EmailOtpType>([
  "recovery",
  "email",
  "signup",
  "invite",
  "magiclink",
  "email_change",
  "email_change_new",
  "email_change_current",
]);

function devLog(message: string, detail?: Record<string, unknown>): void {
  if (!DEV) return;
  if (detail) {
    console.warn(`[auth/callback:dev] ${message}`, detail);
  } else {
    console.warn(`[auth/callback:dev] ${message}`);
  }
}

function safeNext(next: string | null): string {
  if (next && next.startsWith("/")) return next;
  return "/";
}

function redirectWithoutAuthParams(
  requestUrl: URL,
  pathname: string,
): NextResponse {
  const redirectTo = new URL(requestUrl);
  redirectTo.pathname = pathname;
  redirectTo.searchParams.delete("code");
  redirectTo.searchParams.delete("token_hash");
  redirectTo.searchParams.delete("type");
  redirectTo.searchParams.delete("next");
  return NextResponse.redirect(redirectTo);
}

/**
 * Supabase Auth callback: establishes a session cookie via PKCE code exchange
 * or token_hash OTP verification, then redirects to `next` (e.g. /reset).
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectWithoutAuthParams(requestUrl, next);
    }
    devLog("exchangeCodeForSession failed", { message: error.message });
    return NextResponse.redirect(`${requestUrl.origin}/login?error=auth`);
  }

  if (tokenHash && type && OTP_TYPES.has(type as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (!error) {
      return redirectWithoutAuthParams(requestUrl, next);
    }
    devLog("verifyOtp failed", { type, message: error.message });
    const isRecovery = type === "recovery";
    const query = isRecovery ? "error=expired" : "error=auth";
    return NextResponse.redirect(`${requestUrl.origin}/login?${query}`);
  }

  devLog("no valid auth params", {
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    type,
  });
  return NextResponse.redirect(`${requestUrl.origin}/login?error=auth`);
}
