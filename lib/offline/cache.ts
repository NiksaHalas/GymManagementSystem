import { writeCache } from "@/lib/offline/db";
import { refreshOfflineCacheAction } from "@/lib/offline/refresh-cache-action";
import type { OfflineCacheSnapshot } from "@/lib/offline/types";
import { businessToday } from "@/lib/time/business-day";
import { isOfflineEnabled } from "@/lib/offline/enabled";

function dayKey(date: string) {
  return `dayCheckins:${date}`;
}

function keyHoldersKey(date: string) {
  return `keyHolders:${date}`;
}

export async function refreshOfflineCache(): Promise<boolean> {
  if (!isOfflineEnabled()) return false;

  const snapshot = await refreshOfflineCacheAction();
  if ("error" in snapshot) return false;

  const data = snapshot as OfflineCacheSnapshot;
  const date = data.businessDate ?? businessToday();

  await Promise.all([
    writeCache("catalog", data.catalog),
    writeCache("members", data.members),
    writeCache(dayKey(date), data.dayCheckins),
    writeCache(keyHoldersKey(date), data.keyHolders),
    writeCache("staff", data.staff),
    writeCache("trainerCategories", data.trainerCategories),
  ]);

  return true;
}

export async function cacheMemberContext(
  memberId: string,
  data: unknown,
): Promise<void> {
  await writeCache(`memberCtx:${memberId}`, data);
}

export async function cachePaymentContext(
  memberId: string,
  data: unknown,
): Promise<void> {
  await writeCache(`paymentCtx:${memberId}`, data);
}

export { dayKey, keyHoldersKey };
