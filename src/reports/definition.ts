import { REPORT_TEMPLATES, REPORT_WIDGET_SECTIONS } from "@/data/report-templates";
export type ReportWidget = { site?: string; days?: number };
export type ReportDefinition = { templateId: string; days: number; sections: string[]; widgets?: Record<string, ReportWidget>; documentVersion: "client-report-v3" };
export function reportWidgetSites(definition: ReportDefinition): string[] {
  return [...new Set(Object.values(definition.widgets ?? {}).flatMap(widget => widget.site ? [widget.site] : []))];
}
/** Whitelist sections and preserve the user's order. Unknown legacy sections use the template defaults. */
export function reportDefinition(templateId = "tpl-domain", input: Record<string, unknown> = {}): ReportDefinition {
  const template = REPORT_TEMPLATES.find(t => t.id === templateId);
  if (!template) throw new Error("Unknown report template.");
  const days = Number(input.days ?? 28);
  if (![7, 28, 90].includes(days)) throw new Error("Choose a 7, 28 or 90 day report.");
  const selected = Array.isArray(input.sections) ? [...new Set(input.sections.filter((s): s is string => typeof s === "string" && REPORT_WIDGET_SECTIONS.includes(s)))] : [];
  const widgets: Record<string, ReportWidget> = {};
  if (input.widgets != null) {
    if (typeof input.widgets !== "object" || Array.isArray(input.widgets)) throw new Error("Choose valid report widget settings.");
    for (const [section, value] of Object.entries(input.widgets)) {
      if (!REPORT_WIDGET_SECTIONS.includes(section)) throw new Error("Unknown report widget.");
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid report widget settings.");
      const item = value as Record<string, unknown>;
      if (item.days != null && ![7, 28, 90].includes(Number(item.days))) throw new Error("Choose a 7, 28 or 90 day widget period.");
      if (item.site != null && (typeof item.site !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(item.site))) throw new Error("Choose a website for this widget.");
      widgets[section] = { ...(item.site ? { site: String(item.site) } : {}), ...(item.days != null ? { days: Number(item.days) } : {}) };
    }
  }
  return { templateId, days, sections: selected.length ? selected : template.sections, ...(Object.keys(widgets).length ? { widgets } : {}), documentVersion: "client-report-v3" };
}

/** The library, canvas and schedule links share one validated definition. */
export function reportDefinitionFromSearch(params: URLSearchParams, defaultDays = 28): ReportDefinition {
  const widgets = params.get("widgets");
  let parsedWidgets: unknown;
  try { parsedWidgets = widgets ? JSON.parse(widgets) : undefined; } catch { throw new Error("Invalid report widget settings in this link."); }
  return reportDefinition(params.get("template") ?? "tpl-domain", {
    days: params.get("days") ?? defaultDays,
    sections: params.getAll("section"),
    widgets: parsedWidgets,
  });
}
