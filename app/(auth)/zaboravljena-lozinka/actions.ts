"use server";

import { normalizeUsername } from "@/lib/auth/username";
import { sendPasswordResetEmail } from "@/lib/auth/password-reset";
import {
  buildRateLimitKeys,
  isRateLimited,
  recordRateLimitAttempt,
} from "@/lib/auth/rate-limit";

/**
 * Self-service password reset action.
 * Never reveals whether the username exists or has a recovery email.
 */
export async function requestPasswordResetAction(
  rawUsername: string,
): Promise<void> {
  const username = normalizeUsername(rawUsername);
  if (!username) return;

  const rateLimitKeys = await buildRateLimitKeys("reset", username);
  if (await isRateLimited(rateLimitKeys)) {
    // Always appear successful — do not reveal lockout state.
    return;
  }

  // Count every request (anti-spam; UI always shows success).
  await recordRateLimitAttempt(rateLimitKeys);

  try {
    await sendPasswordResetEmail(username);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[password-reset:dev] unhandled error in requestPasswordResetAction",
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
  }
}
