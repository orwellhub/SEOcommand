import { describe, expect, it } from "vitest";
import {
  authenticateUser,
  canWrite,
  configuredUsers,
  createSessionToken,
  isReadTokenPath,
  verifyReadToken,
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

describe("machine read token", () => {
  const token = "x".repeat(40);
  const bearer = `Bearer ${token}`;

  it("admits a matching bearer token on read-only GETs", () => {
    expect(verifyReadToken(bearer, token, "GET", "/api/live/mortgagecompare")).toBe(true);
    expect(verifyReadToken(bearer, token, "GET", "/api/live/portfolio")).toBe(true);
    expect(verifyReadToken(bearer, token, "HEAD", "/api/usage")).toBe(true);
  });

  it("refuses entirely while the token is unset or too weak", () => {
    expect(verifyReadToken(bearer, undefined, "GET", "/api/live/mortgagecompare")).toBe(false);
    expect(verifyReadToken("Bearer short", "short", "GET", "/api/live/mortgagecompare")).toBe(false);
  });

  it("rejects wrong, malformed and near-miss credentials", () => {
    expect(verifyReadToken(`Bearer ${"y".repeat(40)}`, token, "GET", "/api/live/mortgagecompare")).toBe(false);
    expect(verifyReadToken(token, token, "GET", "/api/live/mortgagecompare")).toBe(false);
    expect(verifyReadToken(`Bearer ${token}x`, token, "GET", "/api/live/mortgagecompare")).toBe(false);
    expect(verifyReadToken(null, token, "GET", "/api/live/mortgagecompare")).toBe(false);
  });

  it("cannot spend budget or mutate: no writes, no sync, no research", () => {
    expect(verifyReadToken(bearer, token, "POST", "/api/sync")).toBe(false);
    expect(verifyReadToken(bearer, token, "GET", "/api/sync")).toBe(false);
    expect(verifyReadToken(bearer, token, "POST", "/api/keyword-research")).toBe(false);
    expect(verifyReadToken(bearer, token, "GET", "/api/keyword-research")).toBe(false);
    expect(verifyReadToken(bearer, token, "POST", "/api/live/mortgagecompare")).toBe(false);
    expect(verifyReadToken(bearer, token, "GET", "/api/workflow/tasks")).toBe(false);
    expect(verifyReadToken(bearer, token, "GET", "/portfolio")).toBe(false);
  });

  it("scopes paths by segment, not by prefix match", () => {
    expect(isReadTokenPath("/api/live")).toBe(true);
    expect(isReadTokenPath("/api/live/mortgagecompare")).toBe(true);
    expect(isReadTokenPath("/api/livestream")).toBe(false);
    expect(isReadTokenPath("/api/usage-report")).toBe(false);
  });
});
