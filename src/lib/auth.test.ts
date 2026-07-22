import { describe, expect, it } from "vitest";
import {
  authenticateUser,
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
    expect(session).toMatchObject({ email: "admin@example.com", name: "Admin", role: "admin" });
  });

  it("rejects tampered and expired sessions", async () => {
    const created = new Date("2026-07-22T10:00:00Z");
    const token = await createSessionToken(user, "a-long-test-secret", created);
    expect(await verifySessionToken(`${token}x`, "a-long-test-secret", created)).toBeNull();
    expect(await verifySessionToken(token, "a-long-test-secret", new Date("2026-07-23T00:00:01Z"))).toBeNull();
  });

  it("loads JSON users and validates credentials", () => {
    const users = configuredUsers({ AUTH_USERS_JSON: JSON.stringify([user]) });
    expect(authenticateUser("admin@example.com", "correct horse", users)?.role).toBe("admin");
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
    expect(canWrite("viewer")).toBe(false);
  });
});
