import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { normalizeUsername, usernameToEmail } from "@/lib/auth/username";
import { sendPasswordResetEmail } from "@/lib/auth/password-reset";

async function assertAdmin() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return false;
  const { data: staff } = await supabase
    .from("staff")
    .select("role, active")
    .eq("id", user.user.id)
    .single();
  return staff?.role === "admin" && staff?.active;
}

// ── POST /api/admin/accounts — create a new worker account ──────────────────

const createSchema = z.object({
  action: z.literal("create"),
  username: z.string().min(3),
  password: z.string().min(8),
  role: z.enum(["user", "admin"]),
  recovery_email: z.string().email().optional().or(z.literal("")),
});

// ── POST /api/admin/accounts — all other actions ─────────────────────────────

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
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Nemate pristup." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Neispravan zahtev." }, { status: 400 });
  }

  const admin = createAdminClient();

  // --- Create account ---
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

    // Role is NEVER passed via user_metadata — the handle_new_user trigger always
    // creates a 'user' row. Admin role is granted below via an explicit service-role
    // update (server-authoritative channel), so client-suppliable metadata can never
    // escalate privileges even if public signup is enabled.
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

    // Grant admin role explicitly (trigger created the row as 'user').
    if (role === "admin") {
      const { error: roleError } = await admin
        .from("staff")
        .update({ role: "admin", updated_at: new Date().toISOString() })
        .eq("id", data.user.id);

      if (roleError) {
        return NextResponse.json(
          { error: `Nalog je kreiran, ali dodela admin uloge nije uspela: ${roleError.message}` },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ ok: true, id: data.user.id });
  }

  // --- Other mutations ---
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
      await admin
        .from("staff")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", payload.staff_id);
      // Optionally ban the auth user to invalidate tokens
      await admin.auth.admin.updateUserById(payload.staff_id, {
        ban_duration: "876600h", // ~100 years
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
      await admin
        .from("staff")
        .update({ role: payload.role, updated_at: new Date().toISOString() })
        .eq("id", payload.staff_id);
      return NextResponse.json({ ok: true });
    }

    case "set_recovery_email": {
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
      // Fetch username for reset
      const { data: staffRow } = await admin
        .from("staff")
        .select("username, recovery_email")
        .eq("id", payload.staff_id)
        .single();

      if (!staffRow?.username) {
        return NextResponse.json({ error: "Radnik nije pronađen." }, { status: 404 });
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
