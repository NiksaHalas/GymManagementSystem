import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { getCurrentStaff } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMemberStatus, type MemberStatusKind } from "@/lib/members/status";
import {
  formatMemberNo,
  formatFullName,
  formatDate,
  formatRsd,
} from "@/lib/members/format";
import { DiscountToggle, CommentEditor } from "./quick-edits";
import { EditMemberDialog } from "./edit-member-dialog";
import { ArchiveControls } from "./archive-controls";
import { MembershipPauseControls } from "./membership-pause-controls";
import { MemberPayButton } from "./member-pay-button";
import { PaymentRowActions } from "@/app/(app)/(shell)/pazar/payment-row-actions";
import { fetchScheduledMemberships } from "@/lib/pazar/queries";
import { businessToday, belgradeDayOf } from "@/lib/time/business-day";
import { paymentKindLabel } from "@/lib/pazar/format";
import type { PaymentRow } from "@/lib/pazar/types";

const STATUS_VARIANT: Record<
  MemberStatusKind,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  expired: "destructive",
  paused: "secondary",
  none: "outline",
};

const RESERVED_WARN_THRESHOLD = 3;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("member")
    .select("first_name, last_name")
    .eq("id", id)
    .maybeSingle();
  const name = data ? `${data.first_name} ${data.last_name}` : "Član";
  return { title: `${name} — Teretana` };
}

export default async function MemberCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  const staff = await getCurrentStaff();
  const isAdmin = staff?.role === "admin";

  const { data: member } = await supabase
    .from("member")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!member) notFound();

  const [membershipRes, paymentsRes, sessionsRes, reservedRes, scheduledMemberships] =
    await Promise.all([
    supabase
      .from("membership")
      .select(
        "*, membership_type(label, package, is_time_based, training_category(label))",
      )
      .eq("member_id", id)
      .in("status", ["aktivna", "pauzirana", "istekla"])
      .order("created_at", { ascending: false }),
    supabase
      .from("payment")
      .select(
        "id, amount_rsd, kind, is_custom_price, custom_reason, voided, paid_at, business_date, membership_id, membership_type(label), staff!payment_staff_id_fkey(username)",
      )
      .eq("member_id", id)
      .order("paid_at", { ascending: false })
      .limit(100),
    supabase
      .from("session_log")
      .select("id, session_date, trainer:staff(username), training_category(label)")
      .eq("member_id", id)
      .order("session_date", { ascending: false })
      .limit(100),
    supabase
      .from("reserved_session")
      .select("id, session_date, amount_rsd, settled, settled_at, training_category(label)")
      .eq("member_id", id)
      .order("session_date", { ascending: false }),
    fetchScheduledMemberships(id),
  ]);

  const memberships = membershipRes.data ?? [];
  // "Trenutna članarina" sekcija: samo stvarno tekuća (aktivna/pauzirana).
  const activeMembership =
    memberships.find((m) => m.status === "aktivna" || m.status === "pauzirana") ?? null;
  // Osnova SAMO za badge na vrhu kartice: tekuća, u suprotnom najnovija istekla -> "Istekla".
  const statusBasis =
    activeMembership ?? memberships.find((m) => m.status === "istekla") ?? null;
  const membershipHistory = memberships.filter((m) => m.status === "istekla");
  type MembershipTypeShape = {
    label: string;
    package: string;
    is_time_based: boolean;
    training_category: { label: string } | null;
  };
  const activeType = (activeMembership?.membership_type ?? null) as unknown as MembershipTypeShape | null;
  const statusType = (statusBasis?.membership_type ?? null) as unknown as MembershipTypeShape | null;
  const payments = paymentsRes.data ?? [];
  // "Datum uplate" tekuće članarine: poslednja važeća uplata vezana za nju
  // (payment.membership_id); fallback na membership.created_at jer record_payment
  // kreira membership red u trenutku uplate.
  const membershipPaymentDate =
    (payments.find(
      (p) => p.membership_id === activeMembership?.id && !p.voided,
    )?.business_date ??
      activeMembership?.created_at ??
      null) as string | null;
  const sessions = sessionsRes.data ?? [];
  const reserved = reservedRes.data ?? [];
  const unsettledCount = reserved.filter((r) => !r.settled).length;

  const status = getMemberStatus(
    statusBasis
      ? {
          status: statusBasis.status,
          endDate: statusBasis.end_date,
          sessionsLeft: statusBasis.sessions_left,
          isTimeBased: statusType?.is_time_based ?? null,
        }
      : null,
  );

  const paymentRows: PaymentRow[] = payments.map((p) => {
    const mt = p.membership_type as unknown as { label: string } | null;
    const staffUser = p.staff as unknown as { username: string } | null;
    const kind = p.kind as PaymentRow["kind"];
    return {
      id: p.id,
      memberId: member.id,
      memberNo: member.member_no,
      memberFirstName: member.first_name,
      memberLastName: member.last_name,
      kind,
      label: mt?.label ?? paymentKindLabel(kind),
      amountRsd: p.amount_rsd,
      isCustomPrice: p.is_custom_price,
      customReason: p.custom_reason,
      voided: p.voided,
      paidAt: p.paid_at,
      businessDate: p.business_date,
      staffUsername: staffUser?.username ?? "—",
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/clanovi">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Nazad na članove
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <MemberPayButton memberId={member.id} />
          <EditMemberDialog member={member} />
          <ArchiveControls memberId={member.id} archived={member.archived} isAdmin={isAdmin} />
        </div>
      </div>

      {/* Header / identity */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-xl">
              {formatFullName(member.first_name, member.last_name)}
            </CardTitle>
            <Badge variant={STATUS_VARIANT[status.kind]}>{status.label}</Badge>
            {status.soon && (
              <span className="text-xs text-amber-600 dark:text-amber-500">
                ističe za {status.daysLeft} d
              </span>
            )}
            {member.discount_flag && <Badge variant="outline">popust</Badge>}
            {member.archived && <Badge variant="secondary">arhiviran</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Broj člana</dt>
              <dd className="font-mono">{formatMemberNo(member.member_no)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Telefon</dt>
              <dd>{member.phone}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Član od</dt>
              <dd>{formatDate(member.created_at)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Quick edits */}
      <Card>
        <CardHeader>
          <CardTitle>Brze izmene</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DiscountToggle memberId={member.id} initial={member.discount_flag} />
          <CommentEditor memberId={member.id} initial={member.comment} />
        </CardContent>
      </Card>

      {/* Current membership */}
      <Card>
        <CardHeader>
          <CardTitle>Trenutna članarina</CardTitle>
        </CardHeader>
        <CardContent>
          {activeMembership ? (
            <>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Tip</dt>
                <dd>{activeType?.label ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Datum uplate</dt>
                <dd>{formatDate(membershipPaymentDate)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={STATUS_VARIANT[status.kind]}>{status.label}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Datum isteka</dt>
                <dd>{formatDate(activeMembership.end_date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Početak</dt>
                <dd>{formatDate(activeMembership.start_date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Preostali termini</dt>
                <dd>
                  {activeType?.is_time_based
                    ? "Neograničeno"
                    : activeMembership.sessions_left ?? "—"}
                </dd>
              </div>
              {activeMembership.status === "pauzirana" && (
                <>
                  <div>
                    <dt className="text-muted-foreground">Pauzirano od</dt>
                    <dd>
                      {activeMembership.paused_at
                        ? formatDate(belgradeDayOf(activeMembership.paused_at))
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Ukupno pauziranih dana</dt>
                    <dd>{activeMembership.paused_days}</dd>
                  </div>
                </>
              )}
            </dl>
            <div className="mt-4">
              <MembershipPauseControls
                membershipId={activeMembership.id}
                memberId={member.id}
                status={activeMembership.status}
                endDate={activeMembership.end_date}
                pausedAt={activeMembership.paused_at}
                pausedDays={activeMembership.paused_days}
              />
            </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nema aktivne članarine.</p>
          )}
        </CardContent>
      </Card>

      {/* Scheduled memberships */}
      <Card>
        <CardHeader>
          <CardTitle>Zakazane (unapred plaćene) članarine</CardTitle>
        </CardHeader>
        <CardContent>
          {scheduledMemberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nema zakazanih članarina.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paket</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead>Kreirano</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduledMemberships.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.package}</TableCell>
                    <TableCell>{m.label}</TableCell>
                    <TableCell>{formatDate(m.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reserved / owed sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Rezervisani (dužni) termini
            {unsettledCount >= RESERVED_WARN_THRESHOLD && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                {unsettledCount} neizmireno
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reserved.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nema dužnih termina.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Tip treninga</TableHead>
                  <TableHead>Iznos</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reserved.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.session_date)}</TableCell>
                    <TableCell>
                      {(r.training_category as unknown as { label: string } | null)?.label ?? "—"}
                    </TableCell>
                    <TableCell>{formatRsd(r.amount_rsd)}</TableCell>
                    <TableCell>
                      <Badge variant={r.settled ? "outline" : "destructive"}>
                        {r.settled ? "Izmireno" : "Duguje"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Membership history (expired) */}
      <Card>
        <CardHeader>
          <CardTitle>Istorija članarina</CardTitle>
        </CardHeader>
        <CardContent>
          {membershipHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nema ranijih članarina.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tip</TableHead>
                  <TableHead>Početak–Istek</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membershipHistory.map((m) => {
                  const mt = m.membership_type as unknown as { label: string } | null;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>{mt?.label ?? "—"}</TableCell>
                      <TableCell>
                        {formatDate(m.start_date)}–{formatDate(m.end_date)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">Istekla</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Payment history */}
      <Card>
        <CardHeader>
          <CardTitle>Istorija uplata</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nema uplata.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Stavka</TableHead>
                  <TableHead>Iznos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Akcije</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentRows.map((p) => (
                  <TableRow key={p.id} className={p.voided ? "opacity-50" : ""}>
                    <TableCell>{formatDate(p.businessDate)}</TableCell>
                    <TableCell>
                      {p.label}
                      {p.isCustomPrice && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          popust
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatRsd(p.amountRsd)}</TableCell>
                    <TableCell>
                      {p.voided ? (
                        <Badge variant="secondary">stornirano</Badge>
                      ) : (
                        <Badge variant="outline">važeća</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <PaymentRowActions
                        row={p}
                        canEdit={isAdmin || p.businessDate === businessToday()}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Session history */}
      <Card>
        <CardHeader>
          <CardTitle>Istorija termina (trening sa trenerom)</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nema evidentiranih termina.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Tip treninga</TableHead>
                  <TableHead>Trener</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => {
                  const trainer = s.trainer as unknown as { username: string } | null;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{formatDate(s.session_date)}</TableCell>
                      <TableCell>
                        {(s.training_category as unknown as { label: string } | null)?.label ?? "—"}
                      </TableCell>
                      <TableCell>{trainer?.username ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
