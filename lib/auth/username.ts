/**
 * Username utilities: normalize, validate, and map to Supabase synthetic email.
 * Login is username + password; Supabase Auth stores <username>@gym.local.
 */

const USERNAME_REGEX = /^[a-z0-9._-]{3,}$/;

/** Normalize a raw username input: trim whitespace and lowercase. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Validate a normalized username. Returns an error message or null. */
export function validateUsername(username: string): string | null {
  if (!username || username.length < 3) {
    return "Korisničko ime mora imati najmanje 3 karaktera.";
  }
  if (!USERNAME_REGEX.test(username)) {
    return "Korisničko ime može sadržati samo slova, cifre, tačku, donju crtu i crticu.";
  }
  return null;
}

/** Map a normalized username to the synthetic internal email used in Supabase Auth. */
export function usernameToEmail(username: string): string {
  return `${username}@gym.local`;
}

/** Extract username from a synthetic email (reverses usernameToEmail). */
export function emailToUsername(email: string): string {
  return email.replace(/@gym\.local$/, "");
}
