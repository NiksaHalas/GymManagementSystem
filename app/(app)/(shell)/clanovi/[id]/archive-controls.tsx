"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
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
import { archiveMember, restoreMember } from "../actions";

export function ArchiveControls({
  memberId,
  archived,
  isAdmin,
}: {
  memberId: string;
  archived: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onArchive() {
    setPending(true);
    const res = await archiveMember(memberId);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Član je arhiviran.");
    router.refresh();
  }

  async function onRestore() {
    setPending(true);
    const res = await restoreMember(memberId);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Član je vraćen iz arhive.");
    router.refresh();
  }

  if (archived) {
    if (!isAdmin) return null;
    return (
      <Button variant="outline" size="sm" onClick={onRestore} disabled={pending}>
        <ArchiveRestore className="mr-2 h-4 w-4" />
        Vrati iz arhive
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={pending}
        >
          <Archive className="mr-2 h-4 w-4" />
          Arhiviraj
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arhivirati člana?</AlertDialogTitle>
          <AlertDialogDescription>
            Član će biti uklonjen iz aktivnih lista, ali istorija ostaje sačuvana.
            Administrator ga može vratiti iz arhive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Otkaži</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onArchive}>
            Arhiviraj
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
