"use server";

import { normalizeUsername } from "@/lib/auth/username";
import { sendPasswordResetEmail } from "@/lib/auth/password-reset";

/**
 * Self-service password reset action.
 * Never reveals whether the username exists or has a recovery email.
 */
export async function requestPasswordResetAction(
  rawUsername: string,
): Promise<void> {
  const username = normalizeUsername(rawUsername);
  if (!username) return;
  // Fire-and-forget: errors are swallowed to prevent enumeration
  await sendPasswordResetEmail(username).catch(() => {});
}
