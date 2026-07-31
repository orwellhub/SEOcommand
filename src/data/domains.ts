import type { Domain, DomainId } from "@/lib/types";

/**
 * Domain portfolio — the single source of truth. Every module (rail, selector,
 * seed generation, provider mappings) derives from this list, so adding a domain
 * is a one-line append. GSC properties and GA4 property ids come from the
 * connected Google assets (service account `orwell-seo-reader`). GA4 ids left
 * null are not yet mapped and can be set per-env.
 *
 * NOTE: this file records which assets are MAPPED. Whether the service account
 * can actually read them is a separate question answered live by
 * /api/health/google and /api/health/dataforseo — never assume from here.
 */
export const DOMAINS: Domain[] = [
  {
    id: "mortgagecompare",
    name: "MortgageCompare",
    host: "mortgagecompare.ae",
    accent: "#7137F5",
    industry: "UAE mortgage & property finance comparison",
    primaryMarket: "United Arab Emirates",
    gscSite: "sc-domain:mortgagecompare.ae",
    ga4PropertyId: "529950642",
    dataForSeoLocationCode: 2784,
    dataForSeoLanguageCode: "en",
  },
  {
    id: "busrentalglobal",
    name: "BusRentalGlobal",
    host: "busrentalglobal.com",
    accent: "#F36A21",
    industry: "Coach, minibus & group transport hire",
    primaryMarket: "Europe (multi-city)",
    gscSite: "sc-domain:busrentalglobal.com",
    // Property created 2026-07 in the Pet Transport Global GA account; its time
    // zone/currency were mirrored from that sibling (US/Los Angeles, USD) and do
    // not match a European operation. Non-destructive to correct in GA4.
    ga4PropertyId: "547998254",
    // No single "Europe" SERP exists, so rankings are measured against the UK
    // (2826) — the largest English-language market this business actually
    // serves. Override per-deployment with DATAFORSEO_LOCATION_BUSRENTALGLOBAL,
    // which locationFor() reads in preference to this value.
    dataForSeoLocationCode: 2826,
    dataForSeoLanguageCode: "en",
  },
  {
    id: "pettransportglobal",
    name: "PetTransportGlobal",
    host: "pettransportglobal.com",
    accent: "#08A3AA",
    industry: "International pet shipping & relocation",
    primaryMarket: "Global (cross-border)",
    gscSite: "sc-domain:pettransportglobal.com",
    ga4PropertyId: "536371348",
    // A global service has no meaningful single "global" SERP location, so
    // rankings are measured against the US (2840) — the largest English-language
    // market for international pet relocation. Override per-deployment with
    // DATAFORSEO_LOCATION_PETTRANSPORTGLOBAL.
    dataForSeoLocationCode: 2840,
    dataForSeoLanguageCode: "en",
  },
  {
    id: "moneycompare",
    name: "MoneyCompare",
    host: "moneycompare.ae",
    accent: "#2563EB",
    industry: "UAE personal finance comparison (loans, cards, accounts)",
    primaryMarket: "United Arab Emirates",
    gscSite: "sc-domain:moneycompare.ae",
    ga4PropertyId: "541738826",
    dataForSeoLocationCode: 2784,
    dataForSeoLanguageCode: "en",
  },
  {
    id: "insurecompare",
    name: "InsureCompare",
    host: "insurecompare.ae",
    accent: "#16A477",
    industry: "UAE insurance comparison (motor, health, home)",
    primaryMarket: "United Arab Emirates",
    gscSite: "sc-domain:insurecompare.ae",
    // Verified 2026-07 against the live GA4 inventory. The earlier note here was
    // wrong: 541656359 is NOT a PetTransportGlobal property — it is a stray
    // duplicate "Insure Compare" property (stream insurecompare.ae) that merely
    // sits inside the Pet Transport Global GA *account*, which is what caused the
    // confusion. It collects no data. 541720356 is the live one.
    ga4PropertyId: "541720356",
    dataForSeoLocationCode: 2784,
    dataForSeoLanguageCode: "en",
  },
  {
    id: "pestremovalusa",
    name: "PestRemovalUSA",
    host: "pestremovalusa.com",
    accent: "#B45309",
    industry: "US pest control & removal services",
    primaryMarket: "United States",
    gscSite: "sc-domain:pestremovalusa.com",
    ga4PropertyId: "542325553",
    dataForSeoLocationCode: 2840,
    dataForSeoLanguageCode: "en",
  },
  {
    id: "closeprotectionhire",
    name: "CloseProtectionHire",
    host: "closeprotectionhire.com",
    accent: "#475569",
    industry: "Close protection & security personnel hire",
    primaryMarket: "United Kingdom",
    gscSite: "sc-domain:closeprotectionhire.com",
    ga4PropertyId: "536427457",
    dataForSeoLocationCode: 2826,
    dataForSeoLanguageCode: "en",
  },
  {
    id: "checkmyenergyclaim",
    name: "CheckMyEnergyClaim",
    host: "checkmyenergyclaim.co.uk",
    accent: "#E6A326",
    industry: "UK business energy claims & compensation",
    primaryMarket: "United Kingdom",
    gscSite: "sc-domain:checkmyenergyclaim.co.uk",
    ga4PropertyId: "548020696", // created 2026-07 (Warm Homes GA account)
    dataForSeoLocationCode: 2826,
    dataForSeoLanguageCode: "en",
  },
  {
    id: "energyclaimhelplineuk",
    name: "EnergyClaimHelpline UK",
    host: "energyclaimhelpline.co.uk",
    accent: "#D97706",
    industry: "UK business energy claims helpline",
    primaryMarket: "United Kingdom",
    gscSite: "sc-domain:energyclaimhelpline.co.uk",
    ga4PropertyId: "547947832", // created 2026-07 (Warm Homes GA account)
    dataForSeoLocationCode: 2826,
    dataForSeoLanguageCode: "en",
  },
  {
    id: "energyclaimhelplinecom",
    name: "EnergyClaimHelpline",
    host: "energyclaimhelpline.com",
    accent: "#EA580C",
    industry: "Business energy claims helpline",
    primaryMarket: "United Kingdom",
    gscSite: "sc-domain:energyclaimhelpline.com",
    ga4PropertyId: "547981364", // created 2026-07 (Warm Homes GA account)
    dataForSeoLocationCode: 2826,
    dataForSeoLanguageCode: "en",
  },
  {
    id: "myenergyclaim",
    name: "MyEnergyClaim",
    host: "myenergyclaim.com",
    accent: "#CA8A04",
    industry: "Business energy claims & mis-sold contracts",
    primaryMarket: "United Kingdom",
    gscSite: "sc-domain:myenergyclaim.com",
    ga4PropertyId: "547980245", // created 2026-07 (Warm Homes GA account)
    dataForSeoLocationCode: 2826,
    dataForSeoLanguageCode: "en",
  },
  {
    id: "warmhomeschemeloan",
    name: "WarmHomeSchemeLoan",
    host: "warmhomeschemeloan.co.uk",
    accent: "#0891B2",
    industry: "UK home energy-efficiency scheme & grants",
    primaryMarket: "United Kingdom",
    gscSite: "sc-domain:warmhomeschemeloan.co.uk",
    // PRE-LAUNCH as of 2026-07: neither warmhomeschemeloan.co.uk nor the
    // transposed warmhomeloanscheme.co.uk (which this GA4 property's data stream
    // points at) resolves — both fail DNS. The site is built but no domain has
    // been pointed at it, so GSC and GA4 will stay empty and that is expected,
    // not a broken connection. Re-check the stream URL when a domain goes live.
    ga4PropertyId: "546413199",
    dataForSeoLocationCode: 2826,
    dataForSeoLanguageCode: "en",
  },
];

export const DOMAIN_MAP: Record<DomainId, Domain> = Object.fromEntries(
  DOMAINS.map((d) => [d.id, d]),
) as Record<DomainId, Domain>;

export function getDomain(id: DomainId): Domain {
  return DOMAIN_MAP[id];
}

export function isDomainId(value: string): value is DomainId {
  return value in DOMAIN_MAP;
}
