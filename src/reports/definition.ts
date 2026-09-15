import { REPORT_TEMPLATES } from "@/data/report-templates";
export type ReportDefinition = { templateId: string; days: number; sections: string[]; documentVersion: "client-report-v3" };
/** Whitelist sections and preserve the user's order. Unknown legacy sections use the template defaults. */
export function reportDefinition(templateId = "tpl-domain", input: Record<string, unknown> = {}): ReportDefinition {
  const template = REPORT_TEMPLATES.find(t => t.id === templateId);
  if (!template) throw new Error("Unknown report template.");
  const days = Number(input.days ?? 28);
  if (![7, 28, 90].includes(days)) throw new Error("Choose a 7, 28 or 90 day report.");
  const selected = Array.isArray(input.sections) ? [...new Set(input.sections.filter((s): s is string => typeof s === "string" && template.sections.includes(s)))] : [];
  return { templateId, days, sections: selected.length ? selected : template.sections, documentVersion: "client-report-v3" };
}
