import { describe, expect, it } from "vitest";
import { DueDateSchema, monthDays, PublicUrlSchema, stageError } from "./content-workspace";
describe("editorial workflow",()=>{
 it("rejects calendar overflow and non-web publishing URLs",()=>{expect(DueDateSchema.safeParse("2026-02-30").success).toBe(false);expect(DueDateSchema.safeParse("2028-02-29").success).toBe(true);expect(PublicUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);});
 it("keeps stage order and review evidence",()=>{expect(stageError({contentStage:"brief"},"published",null,"https://example.com")).toBeTruthy();expect(stageError({contentStage:"draft"},"review")).toBeTruthy();expect(stageError({contentStage:"draft",editor:{text:"Saved copy"}},"review")).toBeNull();expect(stageError({contentStage:"draft",draftUrl:"https://example.com/draft"},"review")).toBeNull();});
 it("builds a Monday-first calendar across year boundaries",()=>{const days=monthDays("2026-01");expect(days).toHaveLength(42);expect(days[0]).toBe("2025-12-29");expect(days[41]).toBe("2026-02-08");});
});
