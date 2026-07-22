import type { Domain, DomainId } from "@/lib/types";

/**
 * Pilot portfolio. Architected so additional domains are added by appending
 * to this registry — every module derives its domain switcher from here.
 */
export const DOMAINS: Domain[] = [
  {
    id: "mortgagecompare",
    name: "MortgageCompare",
    host: "mortgagecompare.ae",
    accentKey: "mortgage",
    accent: "#7137F5",
    industry: "UAE mortgage & property finance comparison",
    primaryMarket: "United Arab Emirates",
    gscConnected: false,
    ga4Connected: false,
    dataForSeoConnected: false,
  },
  {
    id: "busrentalglobal",
    name: "BusRentalGlobal",
    host: "busrentalglobal.com",
    accentKey: "bus",
    accent: "#F36A21",
    industry: "Coach, minibus & group transport hire",
    primaryMarket: "Europe (multi-city)",
    gscConnected: false,
    ga4Connected: false,
    dataForSeoConnected: false,
  },
  {
    id: "pettransportglobal",
    name: "PetTransportGlobal",
    host: "pettransportglobal.com",
    accentKey: "pet",
    accent: "#08A3AA",
    industry: "International pet shipping & relocation",
    primaryMarket: "Global (cross-border)",
    gscConnected: false,
    ga4Connected: false,
    dataForSeoConnected: false,
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
