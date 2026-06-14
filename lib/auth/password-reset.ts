import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendEmail } from "@/utils/resend/send";
import { usernameToEmail } from "@/lib/auth/username";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Request a password reset for a given username.
 * - Looks up the staff row to get the recovery_email.
 * - Generates a recovery link via the service-role admin client (1h TTL).
 * - Emails the link to the recovery_email via Resend.
 *
 * On any error or missing data we return success anyway (no user enumeration).
 */
export async function sendPasswordResetEmail(username: string): Promise<void> {
  const admin = createAdminClient();

  // Find the staff record for this username
  const { data: staff } = await admin
    .from("staff")
    .select("id, recovery_email, active")
    .eq("username", username)
    .single();

  // Silently exit: unknown username, no recovery email, or disabled account
  if (!staff || !staff.recovery_email || !staff.active) return;

  const email = usernameToEmail(username);

  // Generate a recovery link (1h TTL = Supabase default OTP expiry)
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: `${SITE_URL}/reset`,
    },
  });

  if (error || !linkData?.properties?.action_link) return;

  const resetLink = linkData.properties.action_link;

  await sendEmail({
    to: staff.recovery_email,
    subject: "Resetovanje lozinke — Teretana",
    html: buildResetEmailHtml(username, resetLink),
  });
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
