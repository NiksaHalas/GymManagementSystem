import { describe, expect, it } from "vitest";
import { sortMembershipTypes } from "@/lib/catalog/sort";

describe("sortMembershipTypes", () => {
  it("orders session packages numerically and time-based packages last", () => {
    const sorted = sortMembershipTypes([
      { package: "30/1", sessions: null },
      { package: "12/1", sessions: 12 },
      { package: "8/1", sessions: 8 },
      { package: "1/1", sessions: 1 },
    ]);
    expect(sorted.map((t) => t.package)).toEqual(["1/1", "8/1", "12/1", "30/1"]);
  });

  it("breaks ties on the package code", () => {
    const sorted = sortMembershipTypes([
      { package: "b", sessions: null },
      { package: "a", sessions: null },
    ]);
    expect(sorted.map((t) => t.package)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      { package: "30/1", sessions: null },
      { package: "8/1", sessions: 8 },
    ];
    sortMembershipTypes(input);
    expect(input[0].package).toBe("30/1");
  });
});
