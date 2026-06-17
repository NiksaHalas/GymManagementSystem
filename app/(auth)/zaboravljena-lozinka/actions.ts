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
  try {
    await sendPasswordResetEmail(username);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[password-reset:dev] unhandled error in requestPasswordResetAction",
        err instanceof Error ? err.message : err,
      );
    }
  }
}
