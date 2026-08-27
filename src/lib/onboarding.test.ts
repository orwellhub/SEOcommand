import { describe, expect, it } from "vitest";
import { postOnboardingPath } from "./onboarding";

describe("post-onboarding navigation", () => {
  it("returns synthetic QA to the persistent registry", () => {
    expect(postOnboardingPath("qa-journey-example", true)).toBe("/sites?onboarded=synthetic");
  });

  it("opens the created website when it is database-backed", () => {
    expect(postOnboardingPath("mortgage compare", false)).toBe("/sites/mortgage%20compare");
  });
});
