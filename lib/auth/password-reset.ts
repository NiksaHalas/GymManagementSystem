import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendEmail } from "@/utils/resend/send";
import { usernameToEmail } from "@/lib/auth/username";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const DEV = process.env.NODE_ENV === "development";

/** Dev-only diagnostics — never exposed to the client (anti-enumeration). */
function devLog(message: string, detail?: Record<string, unknown>): void {
  if (!DEV) return;
  if (detail) {
    console.warn(`[password-reset:dev] ${message}`, detail);
  } else {
    console.warn(`[password-reset:dev] ${message}`);
  }
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "(invalid)";
  return `${email[0]}***${email.slice(at)}`;
}

function logEnvSanityOnce(): void {
  if (!DEV) return;
  devLog("env check", {
    RESEND_API_KEY: process.env.RESEND_API_KEY ? "set" : "MISSING",
    RESEND_FROM_EMAIL:
      process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev (default)",
    NEXT_PUBLIC_SITE_URL: SITE_URL,
    resetLinkFormat: `${SITE_URL}/auth/callback?token_hash=...&type=recovery&next=/reset`,
  });
}

let envLogged = false;

/**
 * Request a password reset for a given username.
 * - Looks up the staff row to get the recovery_email.
 * - Generates a recovery link via the service-role admin client (1h TTL).
 * - Emails the link to the recovery_email via Resend.
 *
 * On any error or missing data we return success anyway (no user enumeration).
 * In development, reasons are logged server-side only.
 */
export async function sendPasswordResetEmail(username: string): Promise<void> {
  if (!envLogged) {
    logEnvSanityOnce();
    envLogged = true;
  }

  if (!process.env.RESEND_API_KEY) {
    devLog("skip: RESEND_API_KEY is not set in .env.local");
    return;
  }

  const admin = createAdminClient();

  const { data: staff, error: staffError } = await admin
    .from("staff")
    .select("id, recovery_email, active")
    .eq("username", username)
    .maybeSingle();

  if (staffError) {
    devLog("skip: staff lookup failed", { message: staffError.message });
    return;
  }

  if (!staff) {
    devLog("skip: unknown username (no staff row)", { username });
    return;
  }

  if (!staff.recovery_email) {
    devLog("skip: no recovery_email on staff row — set it in Nalozi", {
      username,
    });
    return;
  }

  if (!staff.active) {
    devLog("skip: account disabled", { username });
    return;
  }

  const email = usernameToEmail(username);
  const redirectTo = `${SITE_URL}/auth/callback?next=/reset`;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink(
    {
      type: "recovery",
      email,
      options: { redirectTo },
    },
  );

  if (linkError) {
    devLog("skip: generateLink failed", {
      message: linkError.message,
      redirectTo,
      hint: "Add redirect URL in Supabase Auth → URL Configuration",
    });
    return;
  }

  const tokenHash = linkData?.properties?.hashed_token;
  if (!tokenHash) {
    devLog("skip: generateLink returned no hashed_token", { redirectTo });
    return;
  }

  const resetLink = `${SITE_URL}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=/reset`;
  const to = staff.recovery_email;

  try {
    const result = await sendEmail({
      to,
      subject: "Resetovanje lozinke — Teretana",
      html: buildResetEmailHtml(username, resetLink),
    });
    devLog("sent via Resend", {
      to: maskEmail(to),
      id: result?.id,
      from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
      hint:
        process.env.RESEND_FROM_EMAIL?.includes("resend.dev") ||
        !process.env.RESEND_FROM_EMAIL
          ? "onboarding@resend.dev only delivers to your Resend account email"
          : undefined,
    });
  } catch (err) {
    devLog("Resend send failed", {
      to: maskEmail(to),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

function buildResetEmailHtml(username: string, resetLink: string): string {
  return `
<!DOCTYPE html>
<html lang="sr">
<head><meta charset="UTF-8" /></head>
<body style="font-family: sans-serif; max-width: 480px; margin: 40px auto; color: #1a1a1a;">
  <h2 style="margin-bottom: 8px;">Resetovanje lozinke</h2>
  <p>Primili smo zahtev za resetovanje lozinke za nalog <strong>${username}</strong>.</p>
  <p>Kliknite na dugme ispod da biste postavili novu lozinku. Link važi <strong>1 sat</strong>.</p>
  <div style="margin: 32px 0;">
    <a href="${resetLink}"
       style="background: #0f766e; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
      Resetuj lozinku
    </a>
  </div>
  <p style="color: #666; font-size: 14px;">
    Ako niste tražili ovu promenu, ignorišite ovaj mejl — lozinka ostaje nepromenjena.
  </p>
</body>
</html>`;
}
