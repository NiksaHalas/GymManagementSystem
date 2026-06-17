import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { paymentKindLabel } from "@/lib/pazar/format";

async function assertAdmin() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;
  const { data: staff } = await supabase
    .from("staff")
    .select("role, active")
    .eq("id", user.user.id)
    .single();
  if (staff?.role !== "admin" || !staff.active) return null;
  return supabase;
}

const querySchema = z.object({
  period: z.enum(["day", "month", "year"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function csvEscape(value: string | number | boolean | null): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const supabase = await assertAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Nemate pristup." }, { status: 403 });
  }

  const parsed = querySchema.safeParse({
    period: req.nextUrl.searchParams.get("period"),
    date: req.nextUrl.searchParams.get("date"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Neispravni parametri." }, { status: 400 });
  }

  const { period, date } = parsed.data;
  let start = date;
  let end = date;

  if (period === "month") {
    const [y, m] = date.split("-");
    start = `${y}-${m}-01`;
    const month = parseInt(m, 10);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? parseInt(y, 10) + 1 : parseInt(y, 10);
    end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  } else if (period === "year") {
    const y = date.slice(0, 4);
    start = `${y}-01-01`;
    end = `${parseInt(y, 10) + 1}-01-01`;
  } else {
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    end = next.toISOString().slice(0, 10);
  }

  let query = supabase
    .from("payment")
    .select(
      `
      business_date,
      paid_at,
      amount_rsd,
      is_custom_price,
      voided,
      kind,
      member ( member_no, first_name, last_name ),
      membership_type ( label ),
      staff!payment_staff_id_fkey ( username )
    `,
    )
    .gte("business_date", start)
    .order("paid_at", { ascending: true });

  if (period === "day") {
    query = query.lt("business_date", end);
  } else {
    query = query.lt("business_date", end);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const header = [
    "Datum",
    "Član",
    "BrojČlana",
    "Stavka",
    "Iznos",
    "Custom",
    "Radnik",
    "Status",
  ].join(",");

  const lines = (data ?? []).map((row) => {
    const member = Array.isArray(row.member) ? row.member[0] : row.member;
    const mt = Array.isArray(row.membership_type)
      ? row.membership_type[0]
      : row.membership_type;
    const staffRow = Array.isArray(row.staff) ? row.staff[0] : row.staff;
    const kind = row.kind as "membership" | "debt_settlement" | "fitpass_surcharge";
    const label =
      (mt as { label: string } | null)?.label ?? paymentKindLabel(kind);
    const name = member
      ? `${(member as { first_name: string }).first_name} ${(member as { last_name: string }).last_name}`
      : "Fitpass";

    return [
      csvEscape(row.business_date as string),
      csvEscape(name),
      csvEscape((member as { member_no: number | null } | null)?.member_no ?? ""),
      csvEscape(label),
      csvEscape(row.amount_rsd as number),
      csvEscape(row.is_custom_price as boolean),
      csvEscape((staffRow as { username: string } | null)?.username ?? ""),
      csvEscape((row.voided as boolean) ? "stornirano" : "važeća"),
    ].join(",");
  });

  const csv = [header, ...lines].join("\n");
  const filename = `pazar-${period}-${date}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
