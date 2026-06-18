"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { setCounterDevice, unsetCounterDevice } from "@/lib/auth/counter";

/**
 * Admin-only action: mark this device as the gym counter.
 * Sets the signed httpOnly gym_counter cookie for 1 year.
 */
export async function setThisDeviceAsCounterAction(): Promise<void> {
  await requireAdmin();
  await setCounterDevice();
  revalidatePath("/", "layout");
}

/**
 * Admin-only action: remove the counter device marker from this device.
 */
export async function unsetCounterDeviceAction(): Promise<void> {
  await requireAdmin();
  await unsetCounterDevice();
  revalidatePath("/", "layout");
}
