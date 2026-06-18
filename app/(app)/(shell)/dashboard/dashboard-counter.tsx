"use client";

import * as React from "react";
import { DateNav } from "@/app/(app)/(shell)/dashboard/date-nav";
import { SoonExpireBadge } from "@/app/(app)/(shell)/dashboard/soon-expire-badge";
import { CheckinSearch } from "@/app/(app)/(shell)/dashboard/checkin-search";
import { CheckinDialog } from "@/app/(app)/(shell)/dashboard/checkin-dialog";
import { FitpassDialog } from "@/app/(app)/(shell)/dashboard/fitpass-dialog";
import { ArrivalsTable } from "@/app/(app)/(shell)/dashboard/arrivals-table";
import { KeysPanel } from "@/app/(app)/(shell)/dashboard/keys-panel";
import { PaymentDialog } from "@/components/payment/payment-dialog";
import type {
  DashboardCheckinRow,
  KeyHolder,
  SoonExpireMember,
  StaffOption,
} from "@/lib/dashboard/types";
import type { ShiftOption } from "@/lib/shifts/queries";

interface DashboardCounterProps {
  businessDate: string;
  checkins: DashboardCheckinRow[];
  keyHolders: KeyHolder[];
  soonExpire: SoonExpireMember[];
  staffOptions: StaffOption[];
  canOperate: boolean;
  reconcileMode?: boolean;
  shifts?: ShiftOption[];
}

export function DashboardCounter({
  businessDate,
  checkins,
  keyHolders,
  soonExpire,
  staffOptions,
  canOperate,
  reconcileMode = false,
  shifts = [],
}: DashboardCounterProps) {
  const [checkinMemberId, setCheckinMemberId] = React.useState<string | null>(null);
  const [checkinOpen, setCheckinOpen] = React.useState(false);
  const [fitpassOpen, setFitpassOpen] = React.useState(false);
  const [paymentMemberId, setPaymentMemberId] = React.useState<string | null>(null);
  const [paymentCheckinId, setPaymentCheckinId] = React.useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [paymentRefreshKey, setPaymentRefreshKey] = React.useState(0);

  function openPayment(memberId: string, checkinId: string | null = null) {
    setPaymentMemberId(memberId);
    setPaymentCheckinId(checkinId);
    setPaymentOpen(true);
  }

  const occupiedOpenKeys = keyHolders
    .filter((k) => k.isOpen)
    .map((k) => k.keyNo);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNav businessDate={businessDate} />
        <SoonExpireBadge members={soonExpire} />
      </div>

      {canOperate && !reconcileMode && (
        <CheckinSearch
          onSelectMember={(id) => {
            setCheckinMemberId(id);
            setCheckinOpen(true);
          }}
          onFitpass={() => setFitpassOpen(true)}
          onPayment={(id) => openPayment(id)}
        />
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <ArrivalsTable
            rows={checkins}
            canOperate={canOperate}
            occupiedOpenKeys={occupiedOpenKeys}
            onPayment={(memberId, checkinId) => openPayment(memberId, checkinId)}
            reconcileMode={reconcileMode}
            shifts={shifts}
          />
        </div>
        <aside className="w-full shrink-0 lg:w-52 xl:w-56">
          <KeysPanel holders={keyHolders} />
        </aside>
      </div>

      {canOperate && !reconcileMode && (
        <>
          <CheckinDialog
            memberId={checkinMemberId}
            open={checkinOpen}
            onOpenChange={(o) => {
              setCheckinOpen(o);
              if (!o) setCheckinMemberId(null);
            }}
            staffOptions={staffOptions}
            occupiedOpenKeys={occupiedOpenKeys}
            onPayMembership={() => {
              if (checkinMemberId) openPayment(checkinMemberId);
            }}
            paymentRefreshKey={paymentRefreshKey}
          />
          <PaymentDialog
            memberId={paymentMemberId}
            checkinId={paymentCheckinId}
            open={paymentOpen}
            onOpenChange={(o) => {
              setPaymentOpen(o);
              if (!o) {
                setPaymentMemberId(null);
                setPaymentCheckinId(null);
              }
            }}
            onPaid={() => setPaymentRefreshKey((k) => k + 1)}
          />
          <FitpassDialog
            open={fitpassOpen}
            onOpenChange={setFitpassOpen}
            occupiedKeys={occupiedOpenKeys}
          />
        </>
      )}
    </div>
  );
}
