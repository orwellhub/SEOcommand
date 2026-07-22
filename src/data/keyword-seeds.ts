import type { DomainId, SearchIntent } from "@/lib/types";

/**
 * Hand-written, domain-relevant keyword seeds. These are the "real" terms each
 * pilot brand competes on; metrics (volume, difficulty, CPC, position) are then
 * generated deterministically from each keyword string so the numbers are stable
 * and internally consistent. No keyword is shared across domains.
 */

export interface KeywordSeed {
  keyword: string;
  intent: SearchIntent;
}

export const KEYWORD_SEEDS: Record<DomainId, KeywordSeed[]> = {
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

export const COMPETITOR_HOSTS: Record<DomainId, string[]> = {
  mortgagecompare: [
    "mortgagefinder.ae",
    "yallacompare.com",
    "propertyfinder.ae",
    "holoapp.ae",
    "souqalmal.com",
  ],
  busrentalglobal: [
    "coachhire-comparison.co.uk",
    "eurobuscharter.com",
    "citybusrental.eu",
    "minibushire24.com",
    "kingslinecoaches.com",
  ],
  pettransportglobal: [
    "starwoodpetmovers.com",
    "petrelocation.com",
    "aircanine.co.uk",
    "pettravel.com",
    "jetpets.com.au",
  ],
};

export const LOCATIONS: Record<DomainId, string> = {
  mortgagecompare: "United Arab Emirates",
  busrentalglobal: "United Kingdom",
  pettransportglobal: "United Kingdom",
};
