/** Kill switch for PWA + offline outbox (Tech.md §10). */
export function isOfflineEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OFFLINE_ENABLED === "true";
}
