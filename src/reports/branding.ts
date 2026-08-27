export interface ReportBranding {
  brandName: string;
  logoUrl: string;
  preparedBy: string;
  contactEmail: string;
  accent: string;
  secondaryColor: string;
  footerText: string;
  showPoweredBy: boolean;
}

export interface ReportBrandingSite {
  name: string;
  host: string;
  accent: string;
  siteSettings?: Record<string, unknown>;
}

const HEX = /^#[0-9a-f]{6}$/i;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function resolveReportBranding(site: ReportBrandingSite): ReportBranding {
  const saved = record(site.siteSettings?.reportBranding);
  const accent = text(saved.accent, site.accent);
  const secondary = text(saved.secondaryColor, "#12B8C4");
  return {
    brandName: text(saved.brandName, site.name),
    logoUrl: text(saved.logoUrl, ""),
    preparedBy: text(saved.preparedBy, `${site.name} performance team`),
    contactEmail: text(saved.contactEmail, ""),
    accent: HEX.test(accent) ? accent : site.accent,
    secondaryColor: HEX.test(secondary) ? secondary : "#12B8C4",
    footerText: text(saved.footerText, `Confidential SEO performance report for ${site.host}.`),
    showPoweredBy: saved.showPoweredBy === true,
  };
}

export function reportBrandingFromSettings(value: unknown): Partial<ReportBranding> {
  const saved = record(value);
  return {
    brandName: typeof saved.brandName === "string" ? saved.brandName : undefined,
    logoUrl: typeof saved.logoUrl === "string" ? saved.logoUrl : undefined,
    preparedBy: typeof saved.preparedBy === "string" ? saved.preparedBy : undefined,
    contactEmail: typeof saved.contactEmail === "string" ? saved.contactEmail : undefined,
    accent: typeof saved.accent === "string" ? saved.accent : undefined,
    secondaryColor: typeof saved.secondaryColor === "string" ? saved.secondaryColor : undefined,
    footerText: typeof saved.footerText === "string" ? saved.footerText : undefined,
    showPoweredBy: saved.showPoweredBy === true,
  };
}
