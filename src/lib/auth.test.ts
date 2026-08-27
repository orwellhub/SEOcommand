import { describe, expect, it } from "vitest";
import {
  authenticateUser,
  canApproveBudget,
  canWrite,
  configuredUsers,
  createSessionToken,
  verifySessionToken,
} from "./auth";

describe("internal authentication", () => {
  const user = { email: "Admin@Example.com", password: "correct horse", name: "Admin", role: "admin" as const };

  it("creates and verifies a signed session", async () => {
    const now = new Date("2026-07-22T10:00:00Z");
    const token = await createSessionToken(user, "a-long-test-secret", now);
    const session = await verifySessionToken(token, "a-long-test-secret", now);
    expect(session).toMatchObject({ email: "admin@example.com", name: "Admin", role: "admin", groupIds: [] });
  });

  it("rejects tampered and expired sessions", async () => {
    const created = new Date("2026-07-22T10:00:00Z");
    const token = await createSessionToken(user, "a-long-test-secret", created);
    expect(await verifySessionToken(`${token}x`, "a-long-test-secret", created)).toBeNull();
    expect(await verifySessionToken(token, "a-long-test-secret", new Date("2026-07-23T00:00:01Z"))).toBeNull();
  });

  it("loads JSON users and validates credentials", () => {
    const users = configuredUsers({ AUTH_USERS_JSON: JSON.stringify([{ ...user, groupIds: ["group-a"] }]) });
    expect(authenticateUser("admin@example.com", "correct horse", users)).toMatchObject({
      role: "admin",
      groupIds: ["group-a"],
    });
    expect(authenticateUser("admin@example.com", "wrong", users)).toBeNull();
  });

  it("falls back to a single env-configured administrator", () => {
    const users = configuredUsers({ AUTH_EMAIL: "owner@example.com", AUTH_PASSWORD: "secret" });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: "owner@example.com", role: "admin" });
  });

  it("enforces write-capable roles", () => {
    expect(canWrite("admin")).toBe(true);
    expect(canWrite("seo_analyst")).toBe(true);
    expect(canWrite("manager")).toBe(false);
    expect(canWrite("viewer")).toBe(false);
    expect(canApproveBudget("admin")).toBe(true);
    expect(canApproveBudget("manager")).toBe(true);
    expect(canApproveBudget("seo_analyst")).toBe(false);
  });

  it("retains group-scoped grants in signed sessions", async () => {
    const now = new Date("2026-07-22T10:00:00Z");
    const grants = [{ scopeType: "site" as const, scopeId: "site-a", permissions: ["view", "run_scans"] }];
    const token = await createSessionToken({ ...user, groupIds: ["group-a", "group-b"], siteIds: ["site-a"], grants }, "a-long-test-secret", now);
    expect(await verifySessionToken(token, "a-long-test-secret", now)).toMatchObject({ groupIds: ["group-a", "group-b"], siteIds: ["site-a"], grants });
  });

  it("keeps twenty site grants below normal browser cookie limits", async () => {
    const grants = Array.from({ length: 20 }, (_, index) => ({ scopeType: "site" as const, scopeId: `website-${index + 1}`, permissions: ["view", "research", "run_scans", "manage_content"] }));
    const token = await createSessionToken({ ...user, grants }, "a-long-test-secret", new Date("2026-07-22T10:00:00Z"));
    expect(token.length).toBeLessThan(3_800);
    expect((await verifySessionToken(token, "a-long-test-secret", new Date("2026-07-22T10:00:00Z")))?.grants).toEqual(grants);
  });
});
