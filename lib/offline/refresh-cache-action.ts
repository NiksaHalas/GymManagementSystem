"use server";

import { requireUser } from "@/lib/auth/session";
import { isCounterDevice } from "@/lib/auth/counter";
import { businessToday } from "@/lib/time/business-day";
import {
  fetchDayCheckins,
  fetchKeyOccupancy,
  fetchActiveStaff,
  fetchTrainerCheckinCategories,
} from "@/lib/dashboard/queries";
import { fetchPaymentCatalog } from "@/lib/pazar/catalog";
import { searchMembers } from "@/app/(app)/(shell)/clanovi/actions";
import type { OfflineCacheSnapshot } from "@/lib/offline/types";
import type { MemberSearchRow } from "@/lib/members/types";

async function fetchAllActiveMembers(): Promise<MemberSearchRow[]> {
  const all: MemberSearchRow[] = [];
  let page = 0;
  let total = 0;

  do {
    const result = await searchMembers("", { includeArchived: false, page });
    total = result.total;
    all.push(...result.rows);
    page += 1;
  } while (all.length < total);

  return all;
}

export async function refreshOfflineCacheAction(): Promise<
  OfflineCacheSnapshot | { error: string }
> {
  await requireUser();
  if (!(await isCounterDevice())) {
    return { error: "Operacije su dostupne samo na šalteru." };
  }

  const businessDate = businessToday();

  const [catalog, members, dayCheckins, keyHolders, staff, trainerCategories] =
    await Promise.all([
      fetchPaymentCatalog(),
      fetchAllActiveMembers(),
      fetchDayCheckins(businessDate),
      fetchKeyOccupancy(businessDate),
      fetchActiveStaff(),
      fetchTrainerCheckinCategories(),
    ]);

  return {
    catalog,
    members,
    dayCheckins,
    keyHolders,
    staff,
    trainerCategories,
    businessDate,
  };
}

export async function getOfflineMemberContextAction(memberId: string) {
  await requireUser();
  const { fetchCheckinMemberContext } = await import("@/lib/dashboard/queries");
  return fetchCheckinMemberContext(memberId);
}

export async function getOfflinePaymentContextAction(memberId: string) {
  await requireUser();
  const { fetchPaymentContext } = await import("@/lib/pazar/queries");
  return fetchPaymentContext(memberId);
}
