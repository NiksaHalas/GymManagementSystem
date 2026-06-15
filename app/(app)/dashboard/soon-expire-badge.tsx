"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatFullName, formatMemberNo, formatDate } from "@/lib/members/format";
import type { SoonExpireMember } from "@/lib/dashboard/types";

interface SoonExpireBadgeProps {
  members: SoonExpireMember[];
}

export function SoonExpireBadge({ members }: SoonExpireBadgeProps) {
  if (members.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Badge variant="secondary">{members.length}</Badge>
          Uskoro ističe
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Članarine koje ističu za ≤ 3 dana</DialogTitle>
        </DialogHeader>
        <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
              <div>
                <Link
                  href={`/clanovi/${m.id}`}
                  className="font-medium hover:underline"
                >
                  {formatFullName(m.firstName, m.lastName)}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {formatMemberNo(m.memberNo)}
                  {m.membershipLabel ? ` · ${m.membershipLabel}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDate(m.endDate)}
                {m.daysLeft >= 0 ? ` (${m.daysLeft} d.)` : ""}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
