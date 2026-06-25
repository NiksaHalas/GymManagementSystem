import type { MemberCheckinInput, FitpassCheckinInput } from "@/lib/dashboard/schema";
import type { RecordPaymentInput } from "@/lib/pazar/schema";

export type OutboxStatus = "pending" | "syncing" | "failed";

export interface OutboxEnvelope {
  id: string;
  staffId: string;
  businessDate: string;
  status: OutboxStatus;
  createdAt: number;
  error?: string;
}

export type CheckinMemberPayload = MemberCheckinInput & { id: string };

export type CheckinFitpassPayload = FitpassCheckinInput & { id: string };

export type RecordPaymentPayload = RecordPaymentInput & { id: string };

export type MarkLeftPayload = { checkinId: string };

export type UpdateCheckinKeyPayload = { checkinId: string; keyNo: number | null };

export type OutboxIntent =
  | (OutboxEnvelope & { type: "checkin_member"; payload: CheckinMemberPayload })
  | (OutboxEnvelope & { type: "checkin_fitpass"; payload: CheckinFitpassPayload })
  | (OutboxEnvelope & { type: "record_payment"; payload: RecordPaymentPayload })
  | (OutboxEnvelope & { type: "mark_left"; payload: MarkLeftPayload })
  | (OutboxEnvelope & {
      type: "update_checkin_key";
      payload: UpdateCheckinKeyPayload;
    });

export type OutboxIntentInput =
  | { type: "checkin_member"; payload: Omit<CheckinMemberPayload, "id"> }
  | { type: "checkin_fitpass"; payload: Omit<CheckinFitpassPayload, "id"> }
  | { type: "record_payment"; payload: Omit<RecordPaymentPayload, "id"> }
  | { type: "mark_left"; payload: MarkLeftPayload }
  | { type: "update_checkin_key"; payload: UpdateCheckinKeyPayload };

export interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  cachedAt: number;
}

export interface OfflineCacheSnapshot {
  catalog: import("@/lib/pazar/types").PaymentCatalog;
  members: import("@/lib/members/types").MemberSearchRow[];
  dayCheckins: import("@/lib/dashboard/types").DashboardCheckinRow[];
  keyHolders: import("@/lib/dashboard/types").KeyHolder[];
  staff: import("@/lib/dashboard/types").StaffOption[];
  trainerCategories: import("@/lib/dashboard/types").TrainerCheckinCategory[];
  businessDate: string;
}
