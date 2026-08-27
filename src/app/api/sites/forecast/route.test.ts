import { describe, expect, it } from "vitest";
import { POST } from "./route";

function request(aiPlatforms: number) {
  return new Request("http://localhost/api/sites/forecast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      trackedKeywords: 100,
      crawlMaxPages: 10_000,
      backlinkLimit: 10_000,
      aiPrompts: 10,
      aiPlatforms,
      devices: ["desktop", "mobile"],
    }),
  });
}

describe("site cost forecast route", () => {
  it("accepts every supported AI visibility surface", async () => {
    const response = await POST(request(7));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toHaveProperty("forecast.highUsd");
  });

  it("rejects unsupported platform counts", async () => {
    const response = await POST(request(8));
    expect(response.status).toBe(400);
  });
});
