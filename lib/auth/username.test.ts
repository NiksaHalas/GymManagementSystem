import { describe, expect, it } from "vitest";
import {
  emailToUsername,
  normalizeUsername,
  usernameToEmail,
  validateUsername,
} from "@/lib/auth/username";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  Jelena.M ")).toBe("jelena.m");
  });
});

describe("validateUsername", () => {
  it("accepts letters, digits, dot, underscore and dash", () => {
    expect(validateUsername("ana")).toBeNull();
    expect(validateUsername("marko_2.test-x")).toBeNull();
  });

  it("rejects usernames shorter than 3 characters", () => {
    expect(validateUsername("ab")).toMatch(/najmanje 3/);
    expect(validateUsername("")).toMatch(/najmanje 3/);
  });

  it("rejects spaces, uppercase and non-ASCII letters", () => {
    expect(validateUsername("ana m")).not.toBeNull();
    expect(validateUsername("Ana")).not.toBeNull();
    expect(validateUsername("đorđe")).not.toBeNull();
  });
});

describe("synthetic email mapping", () => {
  it("round-trips a username through the internal email", () => {
    expect(usernameToEmail("jelena")).toBe("jelena@gym.local");
    expect(emailToUsername(usernameToEmail("jelena"))).toBe("jelena");
  });

  it("leaves non-synthetic emails untouched", () => {
    expect(emailToUsername("someone@example.com")).toBe("someone@example.com");
  });
});
