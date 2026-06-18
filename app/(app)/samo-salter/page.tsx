import { redirect } from "next/navigation";
import { isCounterDevice } from "@/lib/auth/counter";
import { requireUser } from "@/lib/auth/session";
import { SamoSalterClient } from "@/app/(app)/samo-salter/samo-salter-client";

export const metadata = {
  title: "Samo šalter — Teretana",
};

export default async function SamoSalterPage() {
  const staff = await requireUser();
  const counter = await isCounterDevice();

  if (staff.role === "admin" || counter) {
    redirect("/dashboard");
  }

  return <SamoSalterClient />;
}
