"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatFullName, formatMemberNo, formatRsd } from "@/lib/members/format";
import { formatDate } from "@/lib/pazar/format";
import type { PaymentRow, TakingsSummary } from "@/lib/pazar/types";
import type { ShiftOption } from "@/lib/shifts/queries";
import { PaymentRowActions } from "@/app/(app)/pazar/payment-row-actions";
import { PaymentReconcileActions } from "@/components/payment-reconcile-actions";
import { cn } from "@/lib/utils";

interface PazarClientProps {
  rows: PaymentRow[];
  summary: TakingsSummary;
  canEdit: boolean;
  reconcileMode?: boolean;
  shifts?: ShiftOption[];
}

export function PazarClient({
  rows,
  summary,
  canEdit,
  reconcileMode = false,
  shifts = [],
}: PazarClientProps) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Nema uplata za izabrani dan.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Datum / vreme</TableHead>
            <TableHead>Član</TableHead>
            <TableHead>Stavka</TableHead>
            <TableHead>Radnik</TableHead>
            <TableHead className="text-right">Iznos</TableHead>
            <TableHead>Status</TableHead>
            {reconcileMode && <TableHead>Atribucija smene</TableHead>}
            {canEdit && <TableHead className="text-right">Akcije</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn(row.voided && "opacity-50 line-through")}
            >
              <TableCell>
                <div>{formatDate(row.businessDate)}</div>
                <div className="text-muted-foreground text-xs">
                  {new Date(row.paidAt).toLocaleTimeString("sr-RS", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </TableCell>
              <TableCell>
                {row.memberId ? (
                  <Link
                    href={`/clanovi/${row.memberId}`}
                    className="hover:underline"
                  >
                    {formatFullName(
                      row.memberFirstName ?? "",
                      row.memberLastName ?? "",
                    )}
                  </Link>
                ) : (
                  <span>Fitpass</span>
                )}
                {row.memberNo != null && (
                  <p className="text-muted-foreground text-xs">
                    {formatMemberNo(row.memberNo)}
                  </p>
                )}
              </TableCell>
              <TableCell>
                {row.label}
                {row.isCustomPrice && (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    popust
                  </Badge>
                )}
              </TableCell>
              <TableCell>{row.staffUsername}</TableCell>
              <TableCell className="text-right font-mono">
                {formatRsd(row.amountRsd)}
              </TableCell>
              <TableCell>
                {row.voided ? (
                  <Badge variant="secondary">stornirano</Badge>
                ) : (
                  <Badge variant="outline">važeća</Badge>
                )}
              </TableCell>
              {reconcileMode && (
                <TableCell>
                  <PaymentReconcileActions
                    paymentId={row.id}
                    businessDate={row.businessDate}
                    shifts={shifts}
                  />
                </TableCell>
              )}
              {canEdit && (
                <TableCell className="text-right">
                  <PaymentRowActions row={row} canEdit={canEdit} />
                </TableCell>
              )}
            </TableRow>
          ))}
          <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
            <TableCell colSpan={canEdit ? 4 : 4}>Neto total</TableCell>
            <TableCell className="text-right font-mono">
              {formatRsd(summary.total)}
            </TableCell>
            <TableCell colSpan={canEdit ? 2 : 1}>
              <span className="text-muted-foreground text-xs">
                {summary.count} uplata
              </span>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
