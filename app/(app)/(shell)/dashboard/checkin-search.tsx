"use client";

import * as React from "react";
import { Ticket, UserPlus, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { searchMembersForCheckin } from "@/app/(app)/(shell)/dashboard/actions";
import { useOfflineContext } from "@/components/offline-status";
import { readCache } from "@/lib/offline/db";
import { memberHasOpenVisit } from "@/lib/offline/optimistic";
import { formatFullName, formatMemberNo } from "@/lib/members/format";
import { businessToday } from "@/lib/time/business-day";
import type { CheckinSearchRow, DashboardCheckinRow } from "@/lib/dashboard/types";
import type { MemberSearchRow } from "@/lib/members/types";
import { CreateMemberDialog } from "@/app/(app)/(shell)/clanovi/create-member-dialog";

interface CheckinSearchProps {
  businessDate: string;
  mergedCheckins: DashboardCheckinRow[];
  onSelectMember: (memberId: string) => void;
  onFitpass: () => void;
  onPayment: (memberId: string) => void;
}

function memberRowToSearchRow(
  m: MemberSearchRow,
  openVisit: { keyNo: number | null } | null,
): CheckinSearchRow {
  return {
    id: m.id,
    member_no: m.member_no,
    first_name: m.first_name,
    last_name: m.last_name,
    phone: m.phone,
    discount_flag: m.discount_flag,
    comment: m.comment,
    archived: m.archived,
    created_at: m.created_at,
    membership_status: m.membership_status,
    membership_label: m.membership_label,
    membership_end_date: m.membership_end_date,
    membership_sessions_left: m.membership_sessions_left,
    membership_is_time_based: m.membership_is_time_based,
    total_count: m.total_count,
    openVisit,
  };
}

function searchCachedMembers(
  members: MemberSearchRow[],
  query: string,
  mergedCheckins: DashboardCheckinRow[],
): CheckinSearchRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const filtered = members.filter((m) => {
    const name = `${m.first_name} ${m.last_name}`.toLowerCase();
    const no = m.member_no != null ? String(m.member_no) : "";
    return name.includes(q) || no.includes(q);
  });

  return filtered.slice(0, 50).map((m) =>
    memberRowToSearchRow(m, memberHasOpenVisit(m.id, mergedCheckins)),
  );
}

export function CheckinSearch({
  businessDate,
  mergedCheckins,
  onSelectMember,
  onFitpass,
  onPayment,
}: CheckinSearchProps) {
  const { online, enabled } = useOfflineContext();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [rows, setRows] = React.useState<CheckinSearchRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (query.trim().length < 1) {
        setRows([]);
        return;
      }
      setLoading(true);
      try {
        if (enabled && !online) {
          const members = (await readCache<MemberSearchRow[]>("members")) ?? [];
          setRows(searchCachedMembers(members, query, mergedCheckins));
        } else {
          const res = await searchMembersForCheckin(query.trim());
          setRows(res.rows);
        }
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, enabled, online, mergedCheckins]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="min-w-[280px] flex-1 justify-start font-normal"
          >
            Pretraži člana (ime, broj)…
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Ime, prezime ili broj člana…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {loading && (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  Pretraga…
                </p>
              )}
              {!loading && query.trim().length >= 1 && rows.length === 0 && (
                <CommandEmpty className="py-4 text-center text-sm">
                  <p>Nema rezultata.</p>
                  {online && (
                    <Button
                      type="button"
                      variant="link"
                      className="mt-1 h-auto p-0"
                      onClick={() => {
                        setOpen(false);
                        setCreateOpen(true);
                      }}
                    >
                      <UserPlus className="mr-1 inline h-3 w-3" />
                      Novi član
                    </Button>
                  )}
                </CommandEmpty>
              )}
              <CommandGroup>
                {rows.map((m) => {
                  const today = businessDate || businessToday();
                  const expiredWithSessions =
                    m.membership_is_time_based === false &&
                    (m.membership_sessions_left ?? 0) > 0 &&
                    (m.membership_status === "istekla" ||
                      (m.membership_status === "aktivna" &&
                        m.membership_end_date != null &&
                        m.membership_end_date < today));

                  return (
                  <CommandItem
                    key={m.id}
                    value={m.id}
                    onSelect={() => {
                      setOpen(false);
                      setQuery("");
                      onSelectMember(m.id);
                    }}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span>{formatFullName(m.first_name, m.last_name)}</span>
                        <span className="text-muted-foreground text-xs">
                          {formatMemberNo(m.member_no)} · {m.phone}
                          {m.membership_label ? ` · ${m.membership_label}` : ""}
                        </span>
                        {expiredWithSessions && (
                          <span className="w-fit rounded-md bg-red-500/15 px-1.5 py-0.5 text-xs text-red-700 dark:text-red-400">
                            Istekla — preostalo {m.membership_sessions_left} sesija
                          </span>
                        )}
                        {m.openVisit != null && (
                          <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400 w-fit">
                            {m.openVisit.keyNo != null
                              ? `U teretani — ključ ${m.openVisit.keyNo}`
                              : "U teretani — bez ključa"}
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpen(false);
                          setQuery("");
                          onPayment(m.id);
                        }}
                      >
                        <Banknote className="mr-1 h-3 w-3" />
                        Naplati
                      </Button>
                    </div>
                  </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {online && (
        <CreateMemberDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          redirectToCard={false}
          onCreated={(id) => {
            setCreateOpen(false);
            onSelectMember(id);
          }}
          trigger={
            <Button type="button" variant="secondary" size="sm">
              <UserPlus className="mr-1 h-4 w-4" />
              Novi član
            </Button>
          }
        />
      )}

      <Button type="button" variant="secondary" onClick={onFitpass}>
        <Ticket className="mr-1 h-4 w-4" />
        Fitpass
      </Button>
    </div>
  );
}
