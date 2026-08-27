import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildAlertWebhookRequest, postAlertWebhook } from "./alert-delivery";

describe("email alert webhook contract", () => {
  it("creates a signed email-only delivery and posts it to a sandbox", async () => {
    const request = buildAlertWebhookRequest({
      webhook: "https://mail-sandbox.example.test/seo-alerts",
      secret: "sandbox-signing-secret",
      production: true,
      eventType: "technical_regression",
      channel: "email",
      recipient: "qa@example.test",
      notification: { id: "notice-1", title: "Technical health needs attention" },
    });
    const expected = `sha256=${createHmac("sha256", "sandbox-signing-secret").update(request.body).digest("hex")}`;
    expect(request.headers["x-orwell-signature"]).toBe(expected);
    expect(JSON.parse(request.body)).toMatchObject({
      event: "seo.alert.technical_regression",
      channel: "email",
      recipient: "qa@example.test",
    });

    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    await postAlertWebhook(request, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("requires HTTPS for production delivery", () => {
    expect(() => buildAlertWebhookRequest({
      webhook: "http://mail-sandbox.example.test/seo-alerts",
      production: true,
      eventType: "rank_drop",
      channel: "email",
      recipient: null,
      notification: {},
    })).toThrow("HTTPS");
  });

  it("surfaces sandbox delivery failures", async () => {
    const request = buildAlertWebhookRequest({
      webhook: "https://mail-sandbox.example.test/seo-alerts",
      eventType: "rank_drop",
      channel: "email",
      recipient: null,
      notification: {},
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(postAlertWebhook(request, fetcher)).rejects.toThrow("HTTP 503");
  });
});
