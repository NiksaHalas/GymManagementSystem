"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatKeyHolder } from "@/lib/dashboard/format";
import { findLastKeyHolder } from "@/app/(app)/(shell)/dashboard/actions";
import type { KeyHolder, LastKeyHolder, UnreturnedKey } from "@/lib/dashboard/types";
import { KEY_COUNT } from "@/lib/dashboard/types";
import { formatFullName, formatMemberNo } from "@/lib/members/format";
import { formatBelgradeDateTime } from "@/lib/shifts/format";

interface KeysPanelProps {
  holders: KeyHolder[];
  unreturnedKeys: UnreturnedKey[];
  businessDate: string;
  isPastClosing: boolean;
}

export function KeysPanel({ holders, unreturnedKeys, isPastClosing }: KeysPanelProps) {
  const [keyInput, setKeyInput] = React.useState("");
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [searchResult, setSearchResult] = React.useState<LastKeyHolder | null | "none">(
    null,
  );
  const [searching, setSearching] = React.useState(false);

  async function handleSearch() {
    setSearchError(null);
    setSearchResult(null);

    const parsed = Number(keyInput);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > KEY_COUNT) {
      setSearchError(`Unesite broj ključa od 1 do ${KEY_COUNT}.`);
      return;
    }

    setSearching(true);
    try {
      const result = await findLastKeyHolder(parsed);
      setSearchResult(result ?? "none");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Greška pri pretrazi.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <h2 className="mb-3 text-sm font-semibold">Ključevi</h2>

      <div className="mb-3 flex gap-2">
        <Input
          type="number"
          min={1}
          max={KEY_COUNT}
          placeholder="Broj ključa (1–22)"
          value={keyInput}
          onChange={(e) => {
            setKeyInput(e.target.value);
            setSearchError(null);
            setSearchResult(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSearch();
          }}
          className="h-8 text-sm"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 shrink-0"
          disabled={searching}
          onClick={() => void handleSearch()}
        >
          <Search className="mr-1 h-3.5 w-3.5" />
          Nađi
        </Button>
      </div>

      {searchError && (
        <p className="text-destructive mb-2 text-xs">{searchError}</p>
      )}

      {searchResult === "none" && keyInput && (
        <p className="text-muted-foreground mb-3 text-xs">
          Ključ {keyInput} nije korišćen.
        </p>
      )}

      {searchResult && searchResult !== "none" && (
        <div className="mb-3 rounded-md border bg-muted/30 p-2 text-xs">
          <p className="font-medium">Poslednji držalac — ključ {searchResult.keyNo}</p>
          {searchResult.isFitpass ? (
            <>
              <p className="text-muted-foreground mt-1">Fitpass</p>
              <p className="text-muted-foreground mt-0.5">
                {formatBelgradeDateTime(searchResult.lastHeldAt)}
              </p>
              <p className="text-muted-foreground mt-1 italic">nema kontakta</p>
            </>
          ) : (
            <>
              <p className="mt-1">
                {formatFullName(
                  searchResult.firstName ?? "",
                  searchResult.lastName ?? "",
                )}
              </p>
              <p className="text-muted-foreground">
                {formatMemberNo(searchResult.memberNo)}
                {searchResult.phone ? ` · ${searchResult.phone}` : ""}
              </p>
              <p className="text-muted-foreground mt-0.5">
                {formatBelgradeDateTime(searchResult.lastHeldAt)}
              </p>
              {searchResult.memberId && (
                <Link
                  href={`/clanovi/${searchResult.memberId}`}
                  className="text-primary mt-1 inline-block underline-offset-2 hover:underline"
                >
                  Otvori karton
                </Link>
              )}
            </>
          )}
        </div>
      )}

      {unreturnedKeys.length > 0 && (
        <UnreturnedKeysSection
          keys={unreturnedKeys}
          isPastClosing={isPastClosing}
        />
      )}

      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {holders.map((holder) => (
          <KeyCell key={holder.keyNo} holder={holder} />
        ))}
      </div>
    </div>
  );
}

function UnreturnedKeysSection({
  keys,
  isPastClosing,
}: {
  keys: UnreturnedKey[];
  isPastClosing: boolean;
}) {
  return (
    <div
      className={cn(
        "mb-3 rounded-md border p-2 text-xs",
        isPastClosing
          ? "border-destructive/50 bg-destructive/5"
          : "border-muted bg-muted/20",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            "font-semibold",
            isPastClosing && "text-destructive",
          )}
        >
          Nevraćeni ključevi
        </span>
        <Badge variant="destructive" className="h-5 min-w-5 justify-center px-1">
          {keys.length}
        </Badge>
      </div>
      {isPastClosing && (
        <p className="text-destructive mb-2 text-xs">
          Posle zatvaranja — proverite ko je odneo ključ.
        </p>
      )}
      <ul className="space-y-1.5">
        {keys.map((k) => (
          <UnreturnedKeyRow key={k.keyNo} item={k} />
        ))}
      </ul>
    </div>
  );
}

function UnreturnedKeyRow({ item }: { item: UnreturnedKey }) {
  const holderLabel = formatKeyHolder({
    keyNo: item.keyNo,
    checkinId: item.checkinId,
    memberId: item.memberId,
    memberNo: item.memberNo,
    firstName: item.firstName,
    lastName: item.lastName,
    isFitpass: item.isFitpass,
    isOpen: true,
  });

  return (
    <li className="text-muted-foreground">
      <span className="font-medium text-foreground">Ključ {item.keyNo}</span>
      {" · "}
      {item.isFitpass ? (
        <>
          Fitpass
          <span className="italic"> · nema kontakta</span>
        </>
      ) : item.memberId ? (
        <Link
          href={`/clanovi/${item.memberId}`}
          className="text-primary underline-offset-2 hover:underline"
        >
          {holderLabel}
        </Link>
      ) : (
        holderLabel
      )}
      {" · "}
      {formatBelgradeDateTime(item.checkedInAt)}
      {item.staffUsername && (
        <>
          {" · "}
          <span>@{item.staffUsername}</span>
        </>
      )}
    </li>
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
