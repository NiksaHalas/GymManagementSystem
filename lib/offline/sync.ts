import { createClient } from "@/utils/supabase/client";
import {
  createMemberCheckin,
  createFitpassCheckin,
  markLeft,
  updateCheckinKey,
} from "@/app/(app)/(shell)/dashboard/actions";
import { recordPayment } from "@/app/(app)/(shell)/pazar/actions";
import {
  listPending,
  markFailed,
  markSyncing,
  removePending,
} from "@/lib/offline/outbox";
import type { OutboxIntent } from "@/lib/offline/types";
import { isOfflineEnabled } from "@/lib/offline/enabled";

export type DrainResult = {
  synced: number;
  failed: number;
  skippedHandover: boolean;
};

async function getCurrentStaffId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function syncIntent(intent: OutboxIntent): Promise<{ ok: true } | { ok: false; error: string }> {
  switch (intent.type) {
    case "checkin_member": {
      const { id, ...rest } = intent.payload;
      return createMemberCheckin({
        ...rest,
        id,
        businessDate: intent.businessDate,
      });
    }
    case "checkin_fitpass": {
      const { id, ...rest } = intent.payload;
      return createFitpassCheckin({
        ...rest,
        id,
        businessDate: intent.businessDate,
      });
    }
    case "record_payment": {
      const { id, ...rest } = intent.payload;
      return recordPayment({
        ...rest,
        id,
        businessDate: intent.businessDate,
      });
    }
    case "mark_left":
      return markLeft({
        checkinId: intent.payload.checkinId,
        businessDate: intent.businessDate,
      });
    case "update_checkin_key":
      return updateCheckinKey({
        checkinId: intent.payload.checkinId,
        keyNo: intent.payload.keyNo,
        businessDate: intent.businessDate,
      });
  }
}

export async function drainOutbox(): Promise<DrainResult> {
  if (!isOfflineEnabled()) {
    return { synced: 0, failed: 0, skippedHandover: false };
  }

  const currentStaffId = await getCurrentStaffId();
  if (!currentStaffId) {
    return { synced: 0, failed: 0, skippedHandover: false };
  }

  const pending = await listPending();
  const actionable = pending.filter((i) => i.status === "pending");

  if (actionable.length === 0) {
    return { synced: 0, failed: 0, skippedHandover: false };
  }

  const foreignWorker = actionable.some((i) => i.staffId !== currentStaffId);
  if (foreignWorker) {
    return { synced: 0, failed: 0, skippedHandover: true };
  }

  let synced = 0;
  let failed = 0;

  for (const intent of actionable) {
    await markSyncing(intent.id);
    const result = await syncIntent(intent);
    if (result.ok) {
      await removePending(intent.id);
      synced += 1;
    } else {
      await markFailed(intent.id, result.error);
      failed += 1;
    }
  }

  return { synced, failed, skippedHandover: false };
}
