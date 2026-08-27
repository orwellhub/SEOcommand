import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { GET } from "./route";

const priorSecret = process.env.AUTH_SECRET;

afterEach(() => {
  if (priorSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = priorSecret;
});

describe("session route", () => {
  it("rejects forged identity headers without a signed cookie", async () => {
    process.env.AUTH_SECRET = "a-long-test-secret";
    const request = new NextRequest("http://localhost/api/auth/session", {
      headers: {
        "x-orwell-user-email": "attacker@example.com",
        "x-orwell-user-role": "admin",
        "x-orwell-user-all-access": "true",
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("returns claims only from a valid signed session", async () => {
    process.env.AUTH_SECRET = "a-long-test-secret";
    const token = await createSessionToken({
      email: "operator@example.com",
      name: "SEO operator",
      role: "seo_analyst",
      groupIds: ["group-a"],
      siteIds: ["site-a"],
      allAccess: false,
      grants: [{ scopeType: "site", scopeId: "site-a", permissions: ["view", "run_scans"] }],
    }, process.env.AUTH_SECRET);
    const request = new NextRequest("http://localhost/api/auth/session", {
      headers: {
        cookie: `${SESSION_COOKIE}=${token}`,
        "x-orwell-user-role": "admin",
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: {
        email: "operator@example.com",
        role: "seo_analyst",
        allAccess: false,
        siteIds: ["site-a"],
      },
    });
  });
});
