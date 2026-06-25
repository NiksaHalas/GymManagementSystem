/**
 * True if `e` is the special error Next.js throws from `redirect()` in the App
 * Router. A successful `redirect()` inside a Server Action surfaces on the client
 * as a thrown error with `digest` starting with "NEXT_REDIRECT" — it must be
 * re-thrown (not treated as a failure) so the navigation completes.
 *
 * Version-proof: checks the `digest` shape directly instead of importing an
 * internal Next.js helper. (`unstable_rethrow` from `next/navigation` is the
 * official alternative.)
 */
export function isRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
