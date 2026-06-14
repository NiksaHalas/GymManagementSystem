"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, MessageSquareText, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getMemberStatus, type MemberStatusKind } from "@/lib/members/status";
import { formatMemberNo, formatFullName } from "@/lib/members/format";
import type { MemberSearchRow } from "@/lib/members/types";
import { searchMembers } from "./actions";

const STATUS_VARIANT: Record<
  MemberStatusKind,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  expired: "destructive",
  paused: "secondary",
  none: "outline",
};

function StatusCell({ row }: { row: MemberSearchRow }) {
  const status = getMemberStatus({
    status: row.membership_status,
    endDate: row.membership_end_date,
    sessionsLeft: row.membership_sessions_left,
    isTimeBased: row.membership_is_time_based,
  });

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <Badge variant={STATUS_VARIANT[status.kind]}>{status.label}</Badge>
        {status.soon && (
          <span className="text-xs text-amber-600 dark:text-amber-500">
            ističe za {status.daysLeft} d
          </span>
        )}
      </div>
      {row.membership_label && (
        <span className="text-xs text-muted-foreground">{row.membership_label}</span>
      )}
    </div>
  );
}

interface MembersTableProps {
  initialRows: MemberSearchRow[];
  initialTotal: number;
  pageSize: number;
}

export function MembersTable({ initialRows, initialTotal, pageSize }: MembersTableProps) {
  const router = useRouter();

  const [query, setQuery] = React.useState("");
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [page, setPage] = React.useState(0);

  const [rows, setRows] = React.useState<MemberSearchRow[]>(initialRows);
  const [total, setTotal] = React.useState(initialTotal);
  const [loading, setLoading] = React.useState(false);

  // Skip the very first run: the initial page was rendered on the server.
  const isFirst = React.useRef(true);
  // Reset to page 0 whenever the query or archived filter changes.
  const prevFilters = React.useRef({ query: "", includeArchived: false });

  React.useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }

    const filtersChanged =
      prevFilters.current.query !== query ||
      prevFilters.current.includeArchived !== includeArchived;
    const effectivePage = filtersChanged ? 0 : page;
    if (filtersChanged && page !== 0) {
      prevFilters.current = { query, includeArchived };
      setPage(0);
      return; // the page change re-triggers this effect
    }
    prevFilters.current = { query, includeArchived };

    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchMembers(query, {
          includeArchived,
          page: effectivePage,
        });
        if (!cancelled) {
          setRows(res.rows);
          setTotal(res.total);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, includeArchived, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pretraga: ime, prezime, broj"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="include-archived"
            checked={includeArchived}
            onCheckedChange={setIncludeArchived}
          />
          <Label htmlFor="include-archived" className="text-sm text-muted-foreground">
            Prikaži arhivirane
          </Label>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Br.</TableHead>
              <TableHead>Ime i prezime</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Članarina</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  {loading ? "Učitavanje…" : "Nema rezultata."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => router.push(`/clanovi/${row.id}`)}
                className={`cursor-pointer ${row.archived ? "opacity-60" : ""}`}
              >
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {formatMemberNo(row.member_no)}
                </TableCell>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    {formatFullName(row.first_name, row.last_name)}
                    {row.comment && (
                      <MessageSquareText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500" />
                    )}
                    {row.discount_flag && (
                      <Badge variant="outline" className="text-[10px]">
                        popust
                      </Badge>
                    )}
                    {row.archived && (
                      <Badge variant="secondary" className="text-[10px]">
                        arhiviran
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{row.phone}</TableCell>
                <TableCell>
                  <StatusCell row={row} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} članova</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            Strana {page + 1} od {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages || loading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
