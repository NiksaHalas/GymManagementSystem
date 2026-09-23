import { describe, expect, it } from "vitest";
import { getMemberStatus, SOON_TO_EXPIRE_DAYS } from "@/lib/members/status";
import type { MembershipSummary } from "@/lib/members/types";

const TODAY = "2026-09-23";

function summary(overrides: Partial<MembershipSummary>): MembershipSummary {
  return {
    status: "aktivna",
    endDate: "2026-10-20",
    sessionsLeft: null,
    isTimeBased: true,
    ...overrides,
  };
}

describe("getMemberStatus", () => {
  it("reports no membership when there is no summary or status", () => {
    expect(getMemberStatus(null, TODAY).kind).toBe("none");
    expect(getMemberStatus(summary({ status: null }), TODAY).kind).toBe("none");
  });

  it("reports paused memberships without a day count", () => {
    const s = getMemberStatus(summary({ status: "pauzirana" }), TODAY);
    expect(s).toMatchObject({ kind: "paused", label: "Pauzirana", daysLeft: null });
  });

  it("treats a past end date as expired even if the stored status is aktivna", () => {
    const s = getMemberStatus(summary({ endDate: "2026-09-22" }), TODAY);
    expect(s).toMatchObject({ kind: "expired", label: "Istekla", daysLeft: -1 });
  });

  it("treats a session-based package with no sessions left as expired", () => {
    const s = getMemberStatus(
      summary({ isTimeBased: false, sessionsLeft: 0 }),
      TODAY,
    );
    expect(s.kind).toBe("expired");
  });

  it("ignores sessionsLeft for time-based packages", () => {
    const s = getMemberStatus(summary({ sessionsLeft: 0 }), TODAY);
    expect(s.kind).toBe("active");
  });

  it("flags soon-to-expire exactly up to the threshold", () => {
    expect(SOON_TO_EXPIRE_DAYS).toBe(3);

    const atThreshold = getMemberStatus(summary({ endDate: "2026-09-26" }), TODAY);
    expect(atThreshold).toMatchObject({ kind: "active", soon: true, daysLeft: 3 });

    const beyond = getMemberStatus(summary({ endDate: "2026-09-27" }), TODAY);
    expect(beyond).toMatchObject({ kind: "active", soon: false, daysLeft: 4 });
  });

  it("keeps a membership ending today active and soon", () => {
    const s = getMemberStatus(summary({ endDate: TODAY }), TODAY);
    expect(s).toMatchObject({ kind: "active", soon: true, daysLeft: 0 });
  });
});
