import { gymCloseTime } from "@/lib/shifts/format";
import { belgradeInstant, businessToday } from "@/lib/time/business-day";

/** Whether unreturned-keys emphasis applies (past day or after gym close today). */
export function isPastGymClosing(
  businessDate: string,
  nowMs: number = Date.now(),
): boolean {
  if (businessDate < businessToday()) return true;
  const closeInstant = belgradeInstant(businessDate, gymCloseTime(businessDate));
  return nowMs >= closeInstant.getTime();
}
