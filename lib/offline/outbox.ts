import { getOfflineDb, readCache, writeCache } from "@/lib/offline/db";
import type { OutboxIntent, OutboxIntentInput } from "@/lib/offline/types";
import { uuidv7 } from "@/lib/offline/uuid";
import { businessToday } from "@/lib/time/business-day";

export async function enqueue(
  input: OutboxIntentInput,
  staffId: string,
  businessDate: string = businessToday(),
): Promise<OutboxIntent> {
  const db = await getOfflineDb();
  const id = uuidv7();
  const createdAt = Date.now();

  const base = {
    id,
    staffId,
    businessDate,
    status: "pending" as const,
    createdAt,
  };

  let intent: OutboxIntent;

  switch (input.type) {
    case "checkin_member":
      intent = {
        ...base,
        type: "checkin_member",
        payload: { ...input.payload, id },
      };
      break;
    case "checkin_fitpass":
      intent = {
        ...base,
        type: "checkin_fitpass",
        payload: { ...input.payload, id },
      };
      break;
    case "record_payment":
      intent = {
        ...base,
        type: "record_payment",
        payload: { ...input.payload, id },
      };
      break;
    case "mark_left":
      intent = { ...base, type: "mark_left", payload: input.payload };
      break;
    case "update_checkin_key":
      intent = {
        ...base,
        type: "update_checkin_key",
        payload: input.payload,
      };
      break;
  }

  await db.add("outbox", intent);
  return intent;
}

export async function listAll(): Promise<OutboxIntent[]> {
  const db = await getOfflineDb();
  const all = await db.getAll("outbox");
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function listPending(): Promise<OutboxIntent[]> {
  const all = await listAll();
  return all.filter((i) => i.status === "pending" || i.status === "failed");
}

export async function countPending(): Promise<number> {
  const pending = await listPending();
  return pending.filter((i) => i.status === "pending").length;
}

function dependentsOf(checkinId: string, intents: OutboxIntent[]): string[] {
  const ids: string[] = [];
  for (const intent of intents) {
    if (intent.status !== "pending") continue;
    if (intent.type === "record_payment" && intent.payload.checkinId === checkinId) {
      ids.push(intent.id);
    }
    if (intent.type === "mark_left" && intent.payload.checkinId === checkinId) {
      ids.push(intent.id);
    }
    if (
      intent.type === "update_checkin_key" &&
      intent.payload.checkinId === checkinId
    ) {
      ids.push(intent.id);
    }
  }
  return ids;
}

export async function removePending(id: string): Promise<void> {
  const db = await getOfflineDb();
  const all = await db.getAll("outbox");
  const intent = all.find((i) => i.id === id);
  if (!intent || intent.status !== "pending") return;

  const toRemove = new Set<string>([id]);
  if (intent.type === "checkin_member" || intent.type === "checkin_fitpass") {
    const checkinId = intent.type === "checkin_member" ? intent.payload.id : intent.payload.id;
    for (const depId of dependentsOf(checkinId, all)) {
      toRemove.add(depId);
    }
  }

  for (const removeId of toRemove) {
    await db.delete("outbox", removeId);
  }
}

export async function markSyncing(id: string): Promise<void> {
  const db = await getOfflineDb();
  const intent = await db.get("outbox", id);
  if (!intent) return;
  await db.put("outbox", { ...intent, status: "syncing" });
}

export async function markFailed(id: string, error: string): Promise<void> {
  const db = await getOfflineDb();
  const intent = await db.get("outbox", id);
  if (!intent) return;
  await db.put("outbox", { ...intent, status: "failed", error });
}

export async function markPending(id: string): Promise<void> {
  const db = await getOfflineDb();
  const intent = await db.get("outbox", id);
  if (!intent) return;
  await db.put("outbox", { ...intent, status: "pending", error: undefined });
}

export async function updatePendingIntent(
  id: string,
  patch: Partial<OutboxIntent>,
): Promise<void> {
  const db = await getOfflineDb();
  const intent = await db.get("outbox", id);
  if (!intent || intent.status !== "pending") return;
  await db.put("outbox", { ...intent, ...patch } as OutboxIntent);
}

export async function updatePendingCheckinKey(
  checkinId: string,
  keyNo: number | null,
): Promise<void> {
  const db = await getOfflineDb();
  const intent = await db.get("outbox", checkinId);
  if (!intent || intent.status !== "pending") return;
  if (intent.type === "checkin_member" || intent.type === "checkin_fitpass") {
    await db.put("outbox", {
      ...intent,
      payload: { ...intent.payload, keyNo },
    } as OutboxIntent);
  }
}

export { readCache, writeCache };
