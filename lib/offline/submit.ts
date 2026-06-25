import { enqueue } from "@/lib/offline/outbox";
import type { OutboxIntent, OutboxIntentInput } from "@/lib/offline/types";
import { businessToday } from "@/lib/time/business-day";
import { isOfflineEnabled } from "@/lib/offline/enabled";
import {
  createMemberCheckin,
  createFitpassCheckin,
  markLeft,
  updateCheckinKey,
} from "@/app/(app)/(shell)/dashboard/actions";
import { recordPayment } from "@/app/(app)/(shell)/pazar/actions";

type ActionResult<T = undefined> =
  | { ok: true } & (T extends undefined ? object : T)
  | { ok: false; error: string };

export async function submitOutboxOrOnline<T extends ActionResult>(
  opts: {
    online: boolean;
    staffId: string;
    businessDate?: string;
    outbox: OutboxIntentInput;
    onlineAction: () => Promise<T>;
  },
): Promise<T | { ok: true; offline: true; intent: OutboxIntent }> {
  const businessDate = opts.businessDate ?? businessToday();

  if (isOfflineEnabled() && !opts.online) {
    const intent = await enqueue(opts.outbox, opts.staffId, businessDate);
    return { ok: true, offline: true, intent };
  }

  return opts.onlineAction();
}

export async function submitMemberCheckin(
  online: boolean,
  staffId: string,
  input: Parameters<typeof createMemberCheckin>[0],
) {
  const parsed = input as Record<string, unknown>;
  return submitOutboxOrOnline({
    online,
    staffId,
    businessDate: parsed.businessDate as string | undefined,
    outbox: {
      type: "checkin_member",
      payload: {
        memberId: parsed.memberId as string,
        keyNo: parsed.keyNo as number | null,
        withTrainer: parsed.withTrainer as boolean,
        trainingCategoryId: parsed.trainingCategoryId as number | null,
        trainerId: parsed.trainerId as string | null,
        allowExpiredOverride: parsed.allowExpiredOverride as boolean | undefined,
      },
    },
    onlineAction: () => createMemberCheckin(input),
  });
}

export async function submitFitpassCheckin(
  online: boolean,
  staffId: string,
  input: Parameters<typeof createFitpassCheckin>[0],
) {
  const parsed = input as Record<string, unknown>;
  return submitOutboxOrOnline({
    online,
    staffId,
    outbox: {
      type: "checkin_fitpass",
      payload: {
        keyNo: parsed.keyNo as number,
        isGroupFitpass: parsed.isGroupFitpass as boolean,
      },
    },
    onlineAction: () => createFitpassCheckin(input),
  });
}

export async function submitPayment(
  online: boolean,
  staffId: string,
  input: Parameters<typeof recordPayment>[0],
) {
  const parsed = input as Record<string, unknown>;
  return submitOutboxOrOnline({
    online,
    staffId,
    outbox: {
      type: "record_payment",
      payload: {
        memberId: parsed.memberId as string,
        membershipTypeId: parsed.membershipTypeId as number | null,
        amountRsd: parsed.amountRsd as number,
        isCustomPrice: parsed.isCustomPrice as boolean,
        customReason: parsed.customReason as string | null,
        startMode: parsed.startMode as "payment" | "first_visit",
        settleReservedIds: parsed.settleReservedIds as string[],
        checkinId: parsed.checkinId as string | null,
      },
    },
    onlineAction: () => recordPayment(input),
  });
}

export async function submitMarkLeft(
  online: boolean,
  staffId: string,
  checkinId: string,
  businessDate: string,
) {
  return submitOutboxOrOnline({
    online,
    staffId,
    businessDate,
    outbox: { type: "mark_left", payload: { checkinId } },
    onlineAction: () => markLeft({ checkinId, businessDate }),
  });
}

export async function submitUpdateCheckinKey(
  online: boolean,
  staffId: string,
  checkinId: string,
  keyNo: number | null,
  businessDate: string,
) {
  return submitOutboxOrOnline({
    online,
    staffId,
    businessDate,
    outbox: { type: "update_checkin_key", payload: { checkinId, keyNo } },
    onlineAction: () => updateCheckinKey({ checkinId, keyNo, businessDate }),
  });
}
