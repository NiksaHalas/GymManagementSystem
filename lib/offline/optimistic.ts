import type { DashboardCheckinRow } from "@/lib/dashboard/types";
import type { OutboxIntent } from "@/lib/offline/types";
import { getMemberStatus } from "@/lib/members/status";

function optimisticCheckinFromIntent(intent: OutboxIntent): DashboardCheckinRow | null {
  const now = new Date(intent.createdAt).toISOString();

  if (intent.type === "checkin_member") {
    const p = intent.payload;
    return {
      id: p.id,
      createdAt: now,
      businessDate: intent.businessDate,
      keyNo: p.keyNo,
      keyReturned: false,
      checkedOutAt: null,
      isFitpass: false,
      isGroupFitpass: false,
      withTrainer: p.withTrainer,
      decrementedSession: false,
      hasReservedDebt: false,
      memberId: p.memberId,
      memberNo: null,
      firstName: null,
      lastName: null,
      comment: null,
      membershipLabel: null,
      membershipStatus: "none",
      membershipStatusLabel: "—",
      trainingCategoryLabel: null,
      trainerUsername: null,
      paymentToday: null,
      membershipPaused: false,
      shiftId: null,
      pendingAttribution: false,
      pendingSync: true,
    };
  }

  if (intent.type === "checkin_fitpass") {
    const p = intent.payload;
    return {
      id: p.id,
      createdAt: now,
      businessDate: intent.businessDate,
      keyNo: p.keyNo,
      keyReturned: false,
      checkedOutAt: null,
      isFitpass: true,
      isGroupFitpass: p.isGroupFitpass,
      withTrainer: false,
      decrementedSession: false,
      hasReservedDebt: false,
      memberId: null,
      memberNo: null,
      firstName: null,
      lastName: null,
      comment: null,
      membershipLabel: null,
      membershipStatus: "none",
      membershipStatusLabel: "Fitpass",
      trainingCategoryLabel: null,
      trainerUsername: null,
      paymentToday: p.isGroupFitpass
        ? { amountRsd: 300, membershipLabel: null, kind: "fitpass_surcharge" }
        : null,
      membershipPaused: false,
      shiftId: null,
      pendingAttribution: false,
      pendingSync: true,
    };
  }

  return null;
}

export function mergeOptimisticCheckins(
  serverRows: DashboardCheckinRow[],
  intents: OutboxIntent[],
  businessDate: string,
): DashboardCheckinRow[] {
  const serverIds = new Set(serverRows.map((r) => r.id));
  const byId = new Map(serverRows.map((r) => [r.id, { ...r }]));

  for (const intent of intents) {
    if (intent.businessDate !== businessDate) continue;
    if (intent.status === "failed") continue;

    if (intent.type === "mark_left") {
      const row = byId.get(intent.payload.checkinId);
      if (row) {
        row.keyReturned = true;
        row.checkedOutAt = new Date(intent.createdAt).toISOString();
      }
      continue;
    }

    if (intent.type === "update_checkin_key") {
      const row = byId.get(intent.payload.checkinId);
      if (row) {
        row.keyNo = intent.payload.keyNo;
      }
      continue;
    }

    const optimistic = optimisticCheckinFromIntent(intent);
    if (optimistic && !serverIds.has(optimistic.id)) {
      byId.set(optimistic.id, optimistic);
    }
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function memberHasOpenVisit(
  memberId: string,
  checkins: DashboardCheckinRow[],
): { keyNo: number | null } | null {
  const open = checkins.find(
    (c) =>
      c.memberId === memberId &&
      !c.isFitpass &&
      !c.keyReturned &&
      !("voided" in c && (c as { voided?: boolean }).voided),
  );
  if (!open) return null;
  return { keyNo: open.keyNo };
}

export type { DashboardCheckinRow };

export { getMemberStatus };
