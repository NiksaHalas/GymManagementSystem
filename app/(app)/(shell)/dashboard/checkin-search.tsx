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
import { formatFullName, formatMemberNo } from "@/lib/members/format";
import type { MemberSearchRow } from "@/lib/members/types";
import { CreateMemberDialog } from "@/app/(app)/(shell)/clanovi/create-member-dialog";

interface CheckinSearchProps {
  onSelectMember: (memberId: string) => void;
  onFitpass: () => void;
  onPayment: (memberId: string) => void;
}

export function CheckinSearch({ onSelectMember, onFitpass, onPayment }: CheckinSearchProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [rows, setRows] = React.useState<MemberSearchRow[]>([]);
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
        const res = await searchMembersForCheckin(query.trim());
        setRows(res.rows);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

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
                </CommandEmpty>
              )}
              <CommandGroup>
                {rows.map((m) => (
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
                      <div className="flex flex-col">
                        <span>{formatFullName(m.first_name, m.last_name)}</span>
                        <span className="text-muted-foreground text-xs">
                          {formatMemberNo(m.member_no)} · {m.phone}
                          {m.membership_label ? ` · ${m.membership_label}` : ""}
                        </span>
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
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

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

      <Button type="button" variant="secondary" onClick={onFitpass}>
        <Ticket className="mr-1 h-4 w-4" />
        Fitpass
      </Button>
    </div>
  );
}
