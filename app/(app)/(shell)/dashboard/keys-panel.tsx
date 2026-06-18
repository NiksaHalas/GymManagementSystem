"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatKeyHolder } from "@/lib/dashboard/format";
import type { KeyHolder } from "@/lib/dashboard/types";

interface KeysPanelProps {
  holders: KeyHolder[];
}

export function KeysPanel({ holders }: KeysPanelProps) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <h2 className="mb-3 text-sm font-semibold">Ključevi</h2>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {holders.map((holder) => (
          <KeyCell key={holder.keyNo} holder={holder} />
        ))}
      </div>
    </div>
  );
}

function KeyCell({ holder }: { holder: KeyHolder }) {
  const occupied = holder.checkinId != null;
  const isOpen = holder.isOpen;

  const button = (
    <button
      type="button"
      disabled={!occupied}
      className={cn(
        "flex h-9 w-full items-center justify-center rounded-md text-xs font-medium transition-colors",
        !occupied && "border border-dashed border-muted-foreground/30 bg-muted/30 text-muted-foreground",
        occupied && isOpen && "bg-destructive/15 text-destructive border border-destructive/30",
        occupied && !isOpen && "bg-muted text-muted-foreground border",
        occupied && "cursor-pointer hover:opacity-80",
        !occupied && "cursor-default",
      )}
    >
      {holder.keyNo}
    </button>
  );

  if (!occupied) return button;

  return (
    <Popover>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent className="w-56 text-sm" side="left">
        <p className="font-medium">Ključ {holder.keyNo}</p>
        <p className="text-muted-foreground mt-1">{formatKeyHolder(holder)}</p>
        {isOpen && (
          <p className="text-destructive mt-1 text-xs">Trenutno u teretani</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
