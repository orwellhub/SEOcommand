import type { DomainId, SearchIntent } from "@/lib/types";
import { DOMAIN_MAP } from "./domains";

/**
 * Keyword seed data.
 *
 * The three original pilots have hand-written keyword universes. Every other
 * domain gets realistic, domain-specific demo keywords generated from a small
 * theme vocabulary + its market — no lorem ipsum, no keywords shared across
 * domains. This keeps the demo dense and consistent while scaling to any number
 * of domains. All of this is replaced by live provider data once connected.
 */

export interface KeywordSeed {
  keyword: string;
  intent: SearchIntent;
}

const CURATED_SEEDS: Partial<Record<DomainId, KeywordSeed[]>> = {
  mortgagecompare: [
    { keyword: "mortgage rates uae", intent: "commercial" },
    { keyword: "best mortgage rates dubai", intent: "commercial" },
    { keyword: "uae mortgage calculator", intent: "transactional" },
    { keyword: "home loan dubai", intent: "commercial" },
    { keyword: "mortgage eligibility uae", intent: "informational" },
    { keyword: "first time buyer mortgage dubai", intent: "commercial" },
    { keyword: "dubai property finance", intent: "commercial" },
    { keyword: "mortgage for expats uae", intent: "commercial" },
    { keyword: "fixed vs variable mortgage uae", intent: "informational" },
    { keyword: "mortgage pre approval dubai", intent: "transactional" },
    { keyword: "how much can i borrow mortgage uae", intent: "informational" },
    { keyword: "abu dhabi mortgage rates", intent: "commercial" },
    { keyword: "islamic home finance uae", intent: "commercial" },
    { keyword: "mortgage down payment uae", intent: "informational" },
    { keyword: "buy to let mortgage dubai", intent: "commercial" },
    { keyword: "mortgage refinance uae", intent: "transactional" },
    { keyword: "self employed mortgage dubai", intent: "commercial" },
    { keyword: "mortgage interest rates forecast uae", intent: "informational" },
    { keyword: "emirates nbd mortgage rates", intent: "commercial" },
    { keyword: "non resident mortgage uae", intent: "commercial" },
    { keyword: "mortgage broker dubai", intent: "transactional" },
    { keyword: "20 year mortgage uae", intent: "commercial" },
    { keyword: "mortgage salary requirements dubai", intent: "informational" },
    { keyword: "off plan property mortgage dubai", intent: "commercial" },
    { keyword: "cheapest mortgage rates uae", intent: "transactional" },
    { keyword: "mortgage life insurance uae", intent: "commercial" },
    { keyword: "dubai land department fees", intent: "informational" },
    { keyword: "how to get a mortgage in dubai", intent: "informational" },
    { keyword: "mortgage vs rent dubai", intent: "informational" },
    { keyword: "green mortgage uae", intent: "commercial" },
  ],
  busrentalglobal: [
    { keyword: "coach hire london", intent: "transactional" },
    { keyword: "minibus hire near me", intent: "transactional" },
    { keyword: "bus rental paris", intent: "transactional" },
    { keyword: "airport transfer coach", intent: "commercial" },
    { keyword: "group transport europe", intent: "commercial" },
    { keyword: "48 seater coach hire", intent: "transactional" },
    { keyword: "minibus with driver berlin", intent: "transactional" },
    { keyword: "wedding bus hire", intent: "commercial" },
    { keyword: "school trip coach hire", intent: "commercial" },
    { keyword: "corporate coach hire", intent: "commercial" },
    { keyword: "coach hire amsterdam", intent: "transactional" },
    { keyword: "private bus rental rome", intent: "transactional" },
    { keyword: "luxury coach hire europe", intent: "commercial" },
    { keyword: "16 seater minibus hire", intent: "transactional" },
    { keyword: "stag do bus hire", intent: "commercial" },
    { keyword: "football team coach hire", intent: "commercial" },
    { keyword: "coach hire barcelona", intent: "transactional" },
    { keyword: "cross border coach travel europe", intent: "informational" },
    { keyword: "how much does coach hire cost", intent: "informational" },
    { keyword: "executive minibus hire", intent: "commercial" },
    { keyword: "coach hire munich oktoberfest", intent: "transactional" },
    { keyword: "conference shuttle bus hire", intent: "commercial" },
    { keyword: "coach hire with wifi", intent: "commercial" },
    { keyword: "day trip coach hire", intent: "commercial" },
    { keyword: "coach hire vienna", intent: "transactional" },
    { keyword: "double decker bus hire", intent: "commercial" },
    { keyword: "festival coach hire europe", intent: "commercial" },
    { keyword: "accessible minibus hire", intent: "commercial" },
    { keyword: "coach hire prague", intent: "transactional" },
    { keyword: "multi city europe coach tour", intent: "informational" },
  ],
  pettransportglobal: [
    { keyword: "international pet shipping", intent: "commercial" },
    { keyword: "pet relocation cost", intent: "informational" },
    { keyword: "shipping a dog overseas", intent: "commercial" },
    { keyword: "pet transport uk to usa", intent: "commercial" },
    { keyword: "airline pet requirements", intent: "informational" },
    { keyword: "pet passport requirements", intent: "informational" },
    { keyword: "cat relocation international", intent: "commercial" },
    { keyword: "pet import documents", intent: "informational" },
    { keyword: "dog quarantine australia", intent: "informational" },
    { keyword: "pet travel crate requirements", intent: "informational" },
    { keyword: "cost to fly a dog internationally", intent: "informational" },
    { keyword: "pet shipping to dubai", intent: "commercial" },
    { keyword: "iata pet crate size", intent: "informational" },
    { keyword: "pet relocation company", intent: "transactional" },
    { keyword: "moving abroad with a dog", intent: "informational" },
    { keyword: "pet transport europe to canada", intent: "commercial" },
    { keyword: "snub nosed dog air travel", intent: "informational" },
    { keyword: "pet microchip requirements travel", intent: "informational" },
    { keyword: "rabies titer test for travel", intent: "informational" },
    { keyword: "ship cat to new zealand", intent: "commercial" },
    { keyword: "pet transport singapore", intent: "commercial" },
    { keyword: "door to door pet shipping", intent: "commercial" },
    { keyword: "pet travel agent", intent: "transactional" },
    { keyword: "flying with a large dog", intent: "informational" },
    { keyword: "pet relocation to germany", intent: "commercial" },
    { keyword: "usda pet health certificate", intent: "informational" },
    { keyword: "how to relocate pets internationally", intent: "informational" },
    { keyword: "pet cargo vs excess baggage", intent: "informational" },
    { keyword: "pet transport to saudi arabia", intent: "commercial" },
    { keyword: "cheapest way to ship a dog abroad", intent: "transactional" },
  ],
};

/** Theme vocabulary for the remaining domains; expanded into keywords generically. */
const THEME_MAP: Record<DomainId, string[]> = {
  moneycompare: [
    "personal loan",
    "credit card",
    "car loan",
    "savings account",
    "debt consolidation loan",
    "balance transfer card",
    "home loan",
  ],
  insurecompare: [
    "car insurance",
    "health insurance",
    "home insurance",
    "travel insurance",
    "life insurance",
    "motor insurance",
  ],
  pestremovalusa: [
    "pest control",
    "termite treatment",
    "bed bug removal",
    "rodent control",
    "cockroach exterminator",
    "mosquito control",
    "wasp nest removal",
  ],
  closeprotectionhire: [
    "close protection officer",
    "bodyguard hire",
    "executive protection",
    "event security",
    "personal security",
    "security chauffeur",
  ],
  checkmyenergyclaim: [
    "business energy claim",
    "mis-sold energy contract",
    "energy broker commission claim",
    "hidden energy commission",
    "energy contract compensation",
  ],
  energyclaimhelplineuk: [
    "energy claim helpline",
    "business energy refund",
    "energy mis-selling claim",
    "commercial energy claim",
    "energy broker refund",
  ],
  energyclaimhelplinecom: [
    "energy claim",
    "commercial energy claim",
    "energy overcharge claim",
    "business gas claim",
    "energy contract refund",
  ],
  myenergyclaim: [
    "my energy claim",
    "business gas claim",
    "electricity contract claim",
    "energy compensation claim",
    "mis-sold business energy",
  ],
  warmhomeschemeloan: [
    "warm home scheme",
    "home insulation grant",
    "boiler grant",
    "energy efficiency loan",
    "eco4 scheme",
    "home heating grant",
  ],
};

const CURATED_COMPETITORS: Partial<Record<DomainId, string[]>> = {
  mortgagecompare: ["mortgagefinder.ae", "yallacompare.com", "propertyfinder.ae", "holoapp.ae", "souqalmal.com"],
  busrentalglobal: ["coachhire-comparison.co.uk", "eurobuscharter.com", "citybusrental.eu", "minibushire24.com", "kingslinecoaches.com"],
  pettransportglobal: ["starwoodpetmovers.com", "petrelocation.com", "aircanine.co.uk", "pettravel.com", "jetpets.com.au"],
  moneycompare: ["yallacompare.com", "souqalmal.com", "policybazaar.ae", "compareit4me.com"],
  insurecompare: ["policybazaar.ae", "yallacompare.com", "souqalmal.com", "insurancemarket.ae"],
  pestremovalusa: ["terminix.com", "orkin.com", "rentokil.com", "trulynolen.com"],
  closeprotectionhire: ["g4s.com", "securitas.co.uk", "taskforcesecurity.co.uk", "westminstersecurity.co.uk"],
  checkmyenergyclaim: ["businessenergyclaims.co.uk", "energyclaimsuk.com", "claimexperts.co.uk"],
  energyclaimhelplineuk: ["businessenergyclaims.co.uk", "energyclaimsuk.com", "reclaimenergy.co.uk"],
  energyclaimhelplinecom: ["energyclaimsuk.com", "businessenergyclaims.co.uk", "claimexperts.co.uk"],
  myenergyclaim: ["energyclaimsuk.com", "businessenergyclaims.co.uk", "reclaimenergy.co.uk"],
  warmhomeschemeloan: ["gov.uk", "simpleenergyadvice.org.uk", "boilergrants.co.uk", "eco4grants.co.uk"],
};

const GENERIC_COMPETITORS = ["comparison-hub.com", "market-leader.co", "trusted-choice.com"];

function marketCode(primaryMarket: string): string {
  const m = primaryMarket.toLowerCase();
  if (m.includes("united arab") || m.includes("uae")) return "uae";
  if (m.includes("united states") || m.includes("usa")) return "usa";
  if (m.includes("kingdom") || m.includes("uk")) return "uk";
  if (m.includes("europe")) return "europe";
  return "";
}

const MODIFIERS: { suffix: (kw: string, mkt: string) => string; intent: SearchIntent }[] = [
  { suffix: (k, m) => (m ? `${k} ${m}` : k), intent: "commercial" },
  { suffix: (k) => `best ${k}`, intent: "commercial" },
  { suffix: (k) => `${k} cost`, intent: "informational" },
  { suffix: (k, m) => (m ? `cheap ${k} ${m}` : `cheap ${k}`), intent: "transactional" },
  { suffix: (k) => `${k} comparison`, intent: "commercial" },
  { suffix: (k) => `${k} near me`, intent: "transactional" },
  { suffix: (k) => `how much is ${k}`, intent: "informational" },
  { suffix: (k) => `${k} quote`, intent: "transactional" },
];

function generateSeeds(domainId: DomainId): KeywordSeed[] {
  const domain = DOMAIN_MAP[domainId];
  const themes = THEME_MAP[domainId] ?? [domain.name.toLowerCase()];
  const mkt = marketCode(domain.primaryMarket);
  const out: KeywordSeed[] = [];
  const seen = new Set<string>();
  themes.forEach((theme, ti) => {
    // Rotate through modifiers so each theme yields a distinct, varied set.
    for (let i = 0; i < 3; i++) {
      const mod = MODIFIERS[(ti + i) % MODIFIERS.length]!;
      const kw = mod.suffix(theme, mkt).trim();
      if (!seen.has(kw)) {
        seen.add(kw);
        out.push({ keyword: kw, intent: mod.intent });
      }
    }
  });
  return out;
}

/** Keyword seeds for a domain — curated where available, else generated. */
export function seedsFor(domainId: DomainId): KeywordSeed[] {
  return CURATED_SEEDS[domainId] ?? generateSeeds(domainId);
}

/** Organic competitors for a domain. */
export function competitorHostsFor(domainId: DomainId): string[] {
  return CURATED_COMPETITORS[domainId] ?? GENERIC_COMPETITORS;
}

/** Primary tracking location label for a domain. */
export function locationFor(domainId: DomainId): string {
  return DOMAIN_MAP[domainId].primaryMarket;
}

export interface AiPromptSeed {
  prompt: string;
  topic: string;
}

const CURATED_AI_PROMPTS: Partial<Record<DomainId, AiPromptSeed[]>> = {
  mortgagecompare: [
    { prompt: "What are the best mortgage rates in the UAE right now?", topic: "Rates" },
    { prompt: "How do I get a mortgage in Dubai as an expat?", topic: "Eligibility" },
    { prompt: "Which UAE bank has the lowest mortgage interest?", topic: "Comparison" },
    { prompt: "How much deposit do I need to buy a home in Dubai?", topic: "Down payment" },
    { prompt: "Is it better to rent or buy in Dubai?", topic: "Advice" },
    { prompt: "What is the mortgage eligibility salary in the UAE?", topic: "Eligibility" },
  ],
  busrentalglobal: [
    { prompt: "Where can I hire a 48 seater coach in London?", topic: "Coach hire" },
    { prompt: "How much does minibus hire with a driver cost?", topic: "Pricing" },
    { prompt: "Best coach hire company for a European tour?", topic: "Comparison" },
    { prompt: "Can I hire a coach for a wedding in Paris?", topic: "Events" },
    { prompt: "What's the cheapest way to move a group across Europe?", topic: "Advice" },
    { prompt: "Which coach hire firms have wifi and toilets?", topic: "Amenities" },
  ],
  pettransportglobal: [
    { prompt: "How much does it cost to ship a dog internationally?", topic: "Pricing" },
    { prompt: "What documents do I need to fly my cat abroad?", topic: "Documents" },
    { prompt: "Best pet relocation company for UK to USA?", topic: "Comparison" },
    { prompt: "What are the IATA crate requirements for pets?", topic: "Requirements" },
    { prompt: "How do I relocate my pet to Australia?", topic: "Routes" },
    { prompt: "Can snub-nosed dogs fly safely?", topic: "Safety" },
  ],
};

/** AI-visibility prompts for a domain — curated where available, else generated. */
export function aiPromptSeedsFor(domainId: DomainId): AiPromptSeed[] {
  const curated = CURATED_AI_PROMPTS[domainId];
  if (curated) return curated;
  const domain = DOMAIN_MAP[domainId];
  const themes = THEME_MAP[domainId] ?? [domain.name.toLowerCase()];
  const mkt = marketCode(domain.primaryMarket).toUpperCase();
  const region = mkt ? ` in the ${mkt}` : "";
  return themes.slice(0, 6).map((t, i) => ({
    prompt:
      i % 2 === 0
        ? `What is the best ${t}${region}?`
        : `How much does ${t} cost${region}?`,
    topic: t.replace(/\b\w/g, (c) => c.toUpperCase()),
  }));
}
