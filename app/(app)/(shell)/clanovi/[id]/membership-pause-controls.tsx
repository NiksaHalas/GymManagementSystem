"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pause, Play } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/members/format";
import { belgradeDayOf, businessToday, daysBetween } from "@/lib/time/business-day";
import { pauseMembership, resumeMembership } from "../actions";
import type { MembershipStatus } from "@/lib/db/types";

export function MembershipPauseControls({
  membershipId,
  memberId,
  status,
  endDate,
  pausedAt,
  pausedDays,
}: {
  membershipId: string;
  memberId: string;
  status: MembershipStatus;
  endDate: string | null;
  pausedAt: string | null;
  pausedDays: number;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  if (status !== "aktivna" && status !== "pauzirana") {
    return null;
  }

  const pausedSoFar =
    status === "pauzirana" && pausedAt
      ? daysBetween(belgradeDayOf(pausedAt), businessToday())
      : 0;

  async function onPause() {
    setPending(true);
    const res = await pauseMembership(membershipId, memberId);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Članarina je pauzirana.");
    router.refresh();
  }

  async function onResume() {
    setPending(true);
    const res = await resumeMembership(membershipId, memberId);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Članarina je nastavljena.");
    router.refresh();
  }

  if (status === "aktivna") {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending}>
            <Pause className="mr-2 h-4 w-4" />
            Pauziraj članarinu
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pauzirati članarinu?</AlertDialogTitle>
            <AlertDialogDescription>
              Članarina će biti zamrznuta — dolasci se snimaju bez naplate i bez
              trošenja sesija. Kada je nastavite, datum isteka
              {endDate ? ` (${formatDate(endDate)})` : ""} biće pomeren za broj
              pauziranih kalendarskih dana.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction onClick={onPause}>Pauziraj</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          <Play className="mr-2 h-4 w-4" />
          Nastavi članarinu
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Nastaviti članarinu?</AlertDialogTitle>
          <AlertDialogDescription>
            Pauzirano je {pausedSoFar} {pausedSoFar === 1 ? "dan" : "dana"} (ukupno
            pauzirano: {pausedDays + pausedSoFar}). Datum isteka biće pomeren za{" "}
            {pausedSoFar} {pausedSoFar === 1 ? "dan" : "dana"}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Otkaži</AlertDialogCancel>
          <AlertDialogAction onClick={onResume}>Nastavi</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
