import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CacheEntry, OutboxIntent } from "@/lib/offline/types";

export const OFFLINE_DB_NAME = "gym-offline";
export const OFFLINE_DB_VERSION = 1;

interface OfflineDBSchema extends DBSchema {
  cache: {
    key: string;
    value: CacheEntry;
  };
  outbox: {
    key: string;
    value: OutboxIntent;
    indexes: {
      byCreatedAt: number;
      byStatus: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

export function getOfflineDb(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("cache")) {
          db.createObjectStore("cache", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          const store = db.createObjectStore("outbox", { keyPath: "id" });
          store.createIndex("byCreatedAt", "createdAt");
          store.createIndex("byStatus", "status");
        }
      },
    });
  }
  return dbPromise;
}

export async function readCache<T>(key: string): Promise<T | null> {
  const db = await getOfflineDb();
  const row = await db.get("cache", key);
  return row ? (row.data as T) : null;
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  const db = await getOfflineDb();
  await db.put("cache", { key, data, cachedAt: Date.now() });
}

export async function deleteCache(key: string): Promise<void> {
  const db = await getOfflineDb();
  await db.delete("cache", key);
}
