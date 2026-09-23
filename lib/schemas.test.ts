import { describe, expect, it } from "vitest";
import {
  createMembershipTypeSchema,
  upsertPriceSchema,
} from "@/lib/catalog/schema";
import {
  fitpassCheckinSchema,
  memberCheckinSchema,
} from "@/lib/dashboard/schema";
import { memberFormSchema } from "@/lib/members/schema";
import {
  editPaymentSchema,
  recordPaymentSchema,
  voidPaymentSchema,
} from "@/lib/pazar/schema";

const UUID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

describe("memberFormSchema", () => {
  const valid = {
    first_name: "Jelena",
    last_name: "Petrović",
    phone: "+381 64/123-45-67",
    discount_flag: false,
    comment: "",
  };

  it("accepts a typical member with a formatted phone", () => {
    expect(memberFormSchema.safeParse(valid).success).toBe(true);
  });

  it("trims names and rejects blank ones", () => {
    const r = memberFormSchema.safeParse({ ...valid, first_name: "   " });
    expect(r.success).toBe(false);
  });

  it("rejects phones with letters", () => {
    const r = memberFormSchema.safeParse({ ...valid, phone: "064-ABC-123" });
    expect(r.success).toBe(false);
  });
});

describe("recordPaymentSchema", () => {
  const valid = {
    memberId: UUID,
    membershipTypeId: 17,
    amountRsd: 3200,
    isCustomPrice: false,
    customReason: null,
    startMode: "payment" as const,
    settleReservedIds: [],
    checkinId: null,
  };

  it("accepts a standard membership payment", () => {
    expect(recordPaymentSchema.safeParse(valid).success).toBe(true);
  });

  it("allows a debt-only payment without a membership type", () => {
    const r = recordPaymentSchema.safeParse({
      ...valid,
      membershipTypeId: null,
      settleReservedIds: [UUID],
    });
    expect(r.success).toBe(true);
  });

  it("rejects negative and fractional amounts", () => {
    expect(recordPaymentSchema.safeParse({ ...valid, amountRsd: -1 }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...valid, amountRsd: 99.5 }).success).toBe(false);
  });

  it("rejects an unknown start mode and a malformed business date", () => {
    expect(
      recordPaymentSchema.safeParse({ ...valid, startMode: "tomorrow" }).success,
    ).toBe(false);
    expect(
      recordPaymentSchema.safeParse({ ...valid, businessDate: "23.09.2026" }).success,
    ).toBe(false);
  });
});

describe("voidPaymentSchema / editPaymentSchema", () => {
  it("requires a non-blank void reason", () => {
    expect(voidPaymentSchema.safeParse({ paymentId: UUID, reason: "  " }).success).toBe(false);
    expect(
      voidPaymentSchema.safeParse({ paymentId: UUID, reason: "Pogrešan paket" }).success,
    ).toBe(true);
  });

  it("does not allow editing a payment down to zero", () => {
    const r = editPaymentSchema.safeParse({ paymentId: UUID, amountRsd: 0, customReason: null });
    expect(r.success).toBe(false);
  });
});

describe("check-in schemas", () => {
  it("limits key numbers to the 22 physical keys", () => {
    const base = {
      memberId: UUID,
      withTrainer: false,
      trainingCategoryId: null,
      trainerId: null,
    };
    expect(memberCheckinSchema.safeParse({ ...base, keyNo: 22 }).success).toBe(true);
    expect(memberCheckinSchema.safeParse({ ...base, keyNo: 23 }).success).toBe(false);
    expect(memberCheckinSchema.safeParse({ ...base, keyNo: null }).success).toBe(true);
  });

  it("requires a key for Fitpass arrivals", () => {
    expect(
      fitpassCheckinSchema.safeParse({ keyNo: null, isGroupFitpass: false }).success,
    ).toBe(false);
    expect(
      fitpassCheckinSchema.safeParse({ keyNo: 5, isGroupFitpass: true }).success,
    ).toBe(true);
  });
});

describe("catalog schemas", () => {
  it("rejects a zero price", () => {
    const r = upsertPriceSchema.safeParse({
      membership_type_id: 1,
      is_discount_price: false,
      amount_rsd: 0,
    });
    expect(r.success).toBe(false);
  });

  const newType = {
    training_category_id: 1,
    package: "16/1",
    label: "Vođeni 16/1",
    is_time_based: false,
    sessions: 16,
    standard_price_rsd: 5100,
  };

  it("accepts a session-based package with a session count", () => {
    expect(createMembershipTypeSchema.safeParse(newType).success).toBe(true);
  });

  it("requires a session count for session-based packages", () => {
    const r = createMembershipTypeSchema.safeParse({ ...newType, sessions: null });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["sessions"]);
  });

  it("requires either an existing or a new category", () => {
    const r = createMembershipTypeSchema.safeParse({
      ...newType,
      training_category_id: undefined,
    });
    expect(r.success).toBe(false);
  });
});
