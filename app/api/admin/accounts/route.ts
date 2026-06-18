import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { getAdminOrNull } from "@/lib/auth/session";
import { normalizeUsername, usernameToEmail } from "@/lib/auth/username";
import { sendPasswordResetEmail } from "@/lib/auth/password-reset";

const LAST_ADMIN_ERROR =
  "Ne možete ukloniti poslednjeg aktivnog administratora.";

async function countActiveAdmins(
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const { count } = await admin
    .from("staff")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("active", true);
  return count ?? 0;
}

async function isLastActiveAdmin(
  admin: ReturnType<typeof createAdminClient>,
  staffId: string,
): Promise<boolean> {
  const { data: row } = await admin
    .from("staff")
    .select("role, active")
    .eq("id", staffId)
    .single();

  if (!row || row.role !== "admin" || !row.active) return false;
  return (await countActiveAdmins(admin)) <= 1;
}

const createSchema = z
  .object({
    action: z.literal("create"),
    username: z.string().min(3),
    password: z.string().min(8),
    role: z.enum(["user", "admin"]),
    recovery_email: z.string().email().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.role === "admin" && !data.recovery_email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email za oporavak je obavezan za admin nalog.",
        path: ["recovery_email"],
      });
    }
  });

const mutateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("disable"),
    staff_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("enable"),
    staff_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("set_role"),
    staff_id: z.string().uuid(),
    role: z.enum(["user", "admin"]),
  }),
  z.object({
    action: z.literal("set_recovery_email"),
    staff_id: z.string().uuid(),
    recovery_email: z.string().email(),
  }),
  z.object({
    action: z.literal("reset_password"),
    staff_id: z.string().uuid(),
  }),
]);

export async function POST(req: NextRequest) {
  const caller = await getAdminOrNull();
  if (!caller) {
    return NextResponse.json({ error: "Nemate pristup." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Neispravan zahtev." }, { status: 400 });
  }

  const admin = createAdminClient();

  if (body.action === "create") {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Neispravni podaci.", details: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const { username: rawUsername, password, role, recovery_email } = parsed.data;
    const username = normalizeUsername(rawUsername);
    const email = usernameToEmail(username);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        recovery_email: recovery_email || null,
      },
    });

    if (error) {
      const msg = error.message.includes("already registered")
        ? "Korisničko ime već postoji."
        : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (role === "admin") {
      const { error: roleError } = await admin
        .from("staff")
        .update({ role: "admin", updated_at: new Date().toISOString() })
        .eq("id", data.user.id);

      if (roleError) {
        return NextResponse.json(
          {
            error: `Nalog je kreiran, ali dodela admin uloge nije uspela: ${roleError.message}`,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true, id: data.user.id });
  }

  const parsed = mutateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Neispravni podaci.", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const payload = parsed.data;

  switch (payload.action) {
    case "disable": {
      if (await isLastActiveAdmin(admin, payload.staff_id)) {
        return NextResponse.json({ error: LAST_ADMIN_ERROR }, { status: 400 });
      }
      await admin
        .from("staff")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", payload.staff_id);
      await admin.auth.admin.updateUserById(payload.staff_id, {
        ban_duration: "876600h",
      });
      return NextResponse.json({ ok: true });
    }

    case "enable": {
      await admin
        .from("staff")
        .update({ active: true, updated_at: new Date().toISOString() })
        .eq("id", payload.staff_id);
      await admin.auth.admin.updateUserById(payload.staff_id, {
        ban_duration: "none",
      });
      return NextResponse.json({ ok: true });
    }

    case "set_role": {
      const { data: target } = await admin
        .from("staff")
        .select("role")
        .eq("id", payload.staff_id)
        .single();

      if (
        target?.role === "admin" &&
        payload.role === "user" &&
        (await isLastActiveAdmin(admin, payload.staff_id))
      ) {
        return NextResponse.json({ error: LAST_ADMIN_ERROR }, { status: 400 });
      }

      await admin
        .from("staff")
        .update({ role: payload.role, updated_at: new Date().toISOString() })
        .eq("id", payload.staff_id);
      return NextResponse.json({ ok: true });
    }

    case "set_recovery_email": {
      if (await isLastActiveAdmin(admin, payload.staff_id)) {
        const { data: current } = await admin
          .from("staff")
          .select("recovery_email")
          .eq("id", payload.staff_id)
          .single();

        if (current?.recovery_email && !payload.recovery_email) {
          return NextResponse.json({ error: LAST_ADMIN_ERROR }, { status: 400 });
        }
      }

      await admin
        .from("staff")
        .update({
          recovery_email: payload.recovery_email,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.staff_id);
      return NextResponse.json({ ok: true });
    }

    case "reset_password": {
      const { data: staffRow } = await admin
        .from("staff")
        .select("username, recovery_email")
        .eq("id", payload.staff_id)
        .single();

      if (!staffRow?.username) {
        return NextResponse.json(
          { error: "Radnik nije pronađen." },
          { status: 404 },
        );
      }

      if (!staffRow.recovery_email) {
        return NextResponse.json(
          { error: "Radnik nema email za oporavak." },
          { status: 400 },
        );
      }

      await sendPasswordResetEmail(staffRow.username);
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Nepoznata akcija." }, { status: 400 });
  }
}
