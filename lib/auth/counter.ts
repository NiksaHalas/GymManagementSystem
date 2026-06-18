import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "gym_counter";
const COOKIE_VALUE = "1";
/**
 * Long-lived: 1 year. The counter cookie marks this device as the physical counter.
 * It is admin-only to set, but any request can read it to decide if shift tracking applies.
 */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const HMAC_ALGORITHM = "sha256";

function getSecret(): string {
  const secret = process.env.COUNTER_DEVICE_SECRET;
  if (!secret) {
    throw new Error("COUNTER_DEVICE_SECRET env var is not set");
  }
  return secret;
}

/** Compute an HMAC signature for the cookie payload. */
function sign(value: string): string {
  return createHmac(HMAC_ALGORITHM, getSecret()).update(value).digest("hex");
}

/** Produce the full signed cookie string: "value.signature" */
function buildSigned(value: string): string {
  return `${value}.${sign(value)}`;
}

/** Verify and unpack a signed cookie. Returns the payload or null if tampered. */
function verifySigned(signed: string): string | null {
  const dotIdx = signed.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const value = signed.slice(0, dotIdx);
  const sig = signed.slice(dotIdx + 1);
  const expected = sign(value);
  if (sig.length !== expected.length) return null;
  const sigBuf = Buffer.from(sig, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
  return value;
}

/**
 * Returns true if the current request comes from the registered counter device.
 * Reads the signed httpOnly `gym_counter` cookie and verifies the HMAC.
 */
export async function isCounterDevice(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(COOKIE_NAME)?.value;
    if (!raw) return false;
    const value = verifySigned(raw);
    return value === COOKIE_VALUE;
  } catch {
    return false;
  }
}

/**
 * Marks the current device as the counter by writing a signed httpOnly cookie.
 * Must be called from a Server Action that has already verified admin role.
 */
export async function setCounterDevice(): Promise<void> {
  const signed = buildSigned(COOKIE_VALUE);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/**
 * Removes the counter device marker from the current device.
 * Must be called from a Server Action that has already verified admin role.
 */
export async function unsetCounterDevice(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
