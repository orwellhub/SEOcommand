import type { DomainId } from "@/lib/types";

/**
 * AI-visibility prompt tracking configuration (NOT demo data — these are the
 * real prompts each brand is measured against). Only domains listed here run
 * paid LLM checks during sync, which keeps AI spend deliberate. Add domains and
 * prompts as tracking expands.
 */
export interface TrackedPrompt {
  prompt: string;
  topic: string;
}

export const TRACKED_AI_PROMPTS: Partial<Record<DomainId, TrackedPrompt[]>> = {
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
