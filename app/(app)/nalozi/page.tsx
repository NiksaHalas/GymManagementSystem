import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { isCounterDevice } from "@/lib/auth/counter";
import { AccountsTable } from "./accounts-table";
import { CreateAccountDialog } from "./create-account-dialog";
import { CounterDeviceToggle } from "@/components/counter-device-toggle";
import { Separator } from "@/components/ui/separator";
import type { Staff } from "@/lib/db/types";

async function getAllStaff(): Promise<Staff[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase
    .from("staff")
    .select("*")
    .order("username");
  return (data ?? []) as Staff[];
}

export const metadata = {
  title: "Nalozi — Teretana",
};

export default async function NaloziPage() {
  const [staffList, isCounter] = await Promise.all([
    getAllStaff(),
    isCounterDevice(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nalozi</h1>
          <p className="text-muted-foreground text-sm">
            Upravljajte nalozima radnika.
          </p>
        </div>
        <CreateAccountDialog />
      </div>

      <AccountsTable staff={staffList} />

      <Separator />

      <div className="rounded-lg border p-4">
        <h2 className="font-semibold mb-3">Ovaj uređaj</h2>
        <CounterDeviceToggle isCounter={isCounter} />
      </div>
    </div>
  );
}
