import type { DomainId } from "@/lib/types";
import type { Envelope, SeoProvider } from "../contracts";
import { SEED, provenanceFor } from "@/data/seed";

/**
 * Demo provider. Serves the deterministic seed dataset through the same
 * contract the live DataForSEO adapter will implement. Every response is
 * wrapped with `mode: "demo"` provenance so the UI can badge it truthfully.
 */
function envelope<T>(domainId: DomainId, data: T): Envelope<T> {
  return { data, provenance: provenanceFor(domainId) };
}

export const demoProvider: SeoProvider = {
  name: "Demo (seeded)",
  live: false,

  async keywords(domainId) {
    return envelope(domainId, SEED.keywords[domainId]);
  },
  async keywordLists(domainId) {
    return envelope(domainId, SEED.keywordLists[domainId]);
  },
  async rankSnapshots(domainId) {
    return envelope(domainId, SEED.rankSnapshots[domainId]);
  },
  async positionBuckets(domainId) {
    return envelope(domainId, SEED.positionBuckets[domainId]);
  },
  async visibility(domainId) {
    return envelope(domainId, SEED.visibility[domainId]);
  },
  async competitors(domainId) {
    return envelope(domainId, SEED.competitors[domainId]);
  },
  async issues(domainId) {
    return envelope(domainId, SEED.technicalIssues[domainId]);
  },
  async health(domainId) {
    return envelope(domainId, SEED.healthBreakdown[domainId]);
  },
  async crawlRuns(domainId) {
    return envelope(domainId, SEED.crawlRuns[domainId]);
  },
  async backlinks(domainId) {
    return envelope(domainId, SEED.backlinks[domainId]);
  },
  async referringDomains(domainId) {
    return envelope(domainId, SEED.referringDomains[domainId]);
  },
  async prompts(domainId) {
    return envelope(domainId, SEED.aiPrompts[domainId]);
  },
  async content(domainId) {
    return envelope(domainId, SEED.content[domainId]);
  },
};
