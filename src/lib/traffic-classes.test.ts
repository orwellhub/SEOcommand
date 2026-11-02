import { describe, expect, it } from "vitest";
import { bySourceName, classifyTraffic, summariseByClass } from "./traffic-classes";

const row = (source: string, medium: string, channel = "", sessions = 1) => ({ source, medium, channel, sessions, engagedSessions: sessions, keyEvents: 0, leads: 0 });

describe("classifyTraffic", () => {
  it.each([
    ["google", "organic", "Organic Search", "google_organic"],
    ["bing", "organic", "Organic Search", "other_search"],
    ["duckduckgo", "organic", "Organic Search", "other_search"],
    ["yahoo", "organic", "Organic Search", "other_search"],
    ["ecosia.org", "organic", "Organic Search", "other_search"],
    ["chatgpt.com", "referral", "Referral", "ai_assistants"],
    ["chatgpt.com", "(not set)", "Unassigned", "ai_assistants"],
    ["perplexity.ai", "referral", "Referral", "ai_assistants"],
    ["gemini.google.com", "referral", "Referral", "ai_assistants"],
    ["copilot.microsoft.com", "referral", "Referral", "ai_assistants"],
    ["claude.ai", "referral", "Referral", "ai_assistants"],
    ["google", "cpc", "Paid Search", "paid"],
    ["facebook.com", "referral", "Organic Social", "social"],
    ["newsletter", "email", "Email", "email"],
    ["(direct)", "(none)", "Direct", "direct"],
    ["khaleejtimes.com", "referral", "Referral", "referral"],
  ])("%s / %s -> %s", (source, medium, channel, want) => {
    expect(classifyTraffic(row(source, medium, channel))).toBe(want);
  });

  it("does not take look-alike hosts for assistants or Google", () => {
    expect(classifyTraffic(row("notchatgpt.com", "referral", "Referral"))).toBe("referral");
    expect(classifyTraffic(row("google.example.com", "referral", "Referral"))).toBe("referral");
    expect(classifyTraffic(row("mail.google.com", "referral", "Referral"))).toBe("referral");
  });

  it("keeps Google paid out of organic", () => {
    expect(classifyTraffic(row("google", "cpc", ""))).toBe("paid");
  });
});

describe("summaries", () => {
  const rows = [row("google", "organic", "Organic Search", 10), row("bing", "organic", "Organic Search", 3), row("chatgpt.com", "referral", "Referral", 4), row("chat.openai.com", "referral", "Referral", 1), row("perplexity.ai", "referral", "Referral", 2)];
  it("sums by class", () => {
    const s = summariseByClass(rows);
    expect(s.google_organic.sessions).toBe(10);
    expect(s.other_search.sessions).toBe(3);
    expect(s.ai_assistants.sessions).toBe(7);
  });
  it("groups assistants by product", () => {
    expect(bySourceName(rows, "ai_assistants")).toEqual([
      { name: "ChatGPT", sessions: 5, engagedSessions: 5, keyEvents: 0, leads: 0 },
      { name: "Perplexity", sessions: 2, engagedSessions: 2, keyEvents: 0, leads: 0 },
    ]);
  });
});
