import { describe, expect, it } from "vitest";
import { DEFAULT_ALERT_CHANNELS } from "./notification-defaults";

describe("notification defaults", () => {
  it("starts new websites with email delivery only", () => {
    expect(DEFAULT_ALERT_CHANNELS).toEqual(["email"]);
  });
});
