import type { VerificationState } from "./workflow-verification";

type RankRow = {
  keyword: string;
  capturedOn: string;
  position: number | null;
  competitors: Array<{ host: string; position: number; url: string | null }>;
  intent: string | null;
  device: string;
  tags: string[];
  targetUrl: string | null;
  locationCode: number;
};
type CompetitorRun = {
  targetHost: string;
  capturedAt: Date | string;
  overview: Record<string, unknown>;
  pages: Record<string, unknown>[];
  keywords: Record<string, unknown>[];
  backlinks: Record<string, unknown>;
};
type Link = {
  id: string;
  sourceDomain: string;
  sourceUrl?: string | null;
  targetUrl?: string | null;
  authority?: number | null;
  status: string;
  competitorHosts?: string[];
  reason?: string;
  relevance?: number;
};
type Work = {
  domainSlug: string;
  executionType: string | null;
  status: string | null;
  verification: Record<string, unknown>;
};

export function buildShareOfVoice(rows: RankRow[]) {
  const dates = [...new Set(rows.map((row) => row.capturedOn))].sort();
  const latest = dates.at(-1) ?? "";
  const prior = dates.at(-2);
  const snapshot = (date?: string) => {
    const scores = new Map<string, number>();
    for (const row of rows.filter((item) => item.capturedOn === date)) {
      scores.set(
        "owned",
        (scores.get("owned") ?? 0) + visibility(row.position),
      );
      for (const competitor of row.competitors)
        scores.set(
          competitor.host,
          (scores.get(competitor.host) ?? 0) + visibility(competitor.position),
        );
    }
    const total = [...scores.values()].reduce((a, b) => a + b, 0) || 1;
    return new Map(
      [...scores].map(([host, score]) => [
        host,
        Math.round((score / total) * 1000) / 10,
      ]),
    );
  };
  const now = snapshot(latest),
    before = snapshot(prior);
  const domains = [...new Set([...now.keys(), ...before.keys()])];
  const leaders = domains
    .map((host) => ({
      host,
      share: now.get(host) ?? 0,
      previousShare: before.get(host) ?? 0,
      change:
        Math.round(((now.get(host) ?? 0) - (before.get(host) ?? 0)) * 10) / 10,
      newcomer: !before.has(host) && host !== "owned",
    }))
    .sort((a, b) => b.share - a.share);
  const segments = [
    ...new Set(
      rows
        .filter((r) => r.capturedOn === latest)
        .flatMap((r) => [r.intent ?? "mixed", r.device, ...r.tags]),
    ),
  ]
    .map((segment) => {
      const selected = rows.filter(
        (r) =>
          r.capturedOn === latest &&
          (r.intent === segment ||
            r.device === segment ||
            r.tags.includes(segment)),
      );
      const owned = selected.reduce((s, r) => s + visibility(r.position), 0);
      const competitors = selected.reduce(
        (s, r) =>
          s + r.competitors.reduce((n, c) => n + visibility(c.position), 0),
        0,
      );
      return {
        segment,
        keywords: selected.length,
        ownedShare:
          owned + competitors
            ? Math.round((owned / (owned + competitors)) * 1000) / 10
            : 0,
      };
    })
    .filter((x) => x.keywords);
  return {
    latestDate: latest,
    leaders,
    segments,
    newcomers: leaders.filter((x) => x.newcomer),
    winners: leaders.filter((x) => x.change > 0).slice(0, 5),
    losers: leaders
      .filter((x) => x.change < 0)
      .slice(-5)
      .reverse(),
  };
}

export function buildContentExplorer(runs: CompetitorRun[]) {
  const groups = new Map<string, CompetitorRun[]>();
  for (const run of runs)
    groups.set(run.targetHost, [...(groups.get(run.targetHost) ?? []), run]);
  return [...groups.entries()].map(([host, items]) => {
    const sorted = [...items].sort(
      (a, b) => +new Date(a.capturedAt) - +new Date(b.capturedAt),
    );
    const latest = sorted.at(-1)!;
    const previous = sorted.at(-2);
    const latestPages = pages(latest.pages);
    const previousUrls = new Set(
      pages(previous?.pages ?? []).map((p) => p.url),
    );
    const newPages = latestPages.filter((p) => !previousUrls.has(p.url));
    const days = previous
      ? Math.max(
          1,
          (+new Date(latest.capturedAt) - +new Date(previous.capturedAt)) /
            86400000,
        )
      : null;
    return {
      host,
      capturedAt: latest.capturedAt,
      organicTraffic: num(latest.overview.organicTraffic),
      topPages: latestPages
        .sort((a, b) => (b.traffic ?? 0) - (a.traffic ?? 0))
        .slice(0, 10),
      newPages: newPages.slice(0, 10),
      publishingVelocity: days
        ? Math.round((newPages.length / days) * 30 * 10) / 10
        : null,
      decliningPages: previous
        ? latestPages
            .filter((p) => {
              const old = pages(previous.pages).find((x) => x.url === p.url);
              return (
                old?.traffic != null &&
                p.traffic != null &&
                p.traffic < old.traffic * 0.8
              );
            })
            .slice(0, 10)
        : [],
      contentGaps: latest.keywords
        .filter((k) => num(k.position) != null && num(k.position)! <= 10)
        .slice(0, 20),
    };
  });
}

export function buildLinkResearch(prospects: Link[], ledger: Link[]) {
  return {
    intersect: prospects
      .filter((p) => p.status !== "dismissed")
      .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0)),
    unlinkedMentions: prospects.filter((p) => /mention/i.test(p.reason ?? "")),
    brokenOpportunities: ledger.filter((l) => l.status === "lost"),
    newLinks: ledger.filter((l) => l.status === "active").slice(0, 50),
    crm: {
      discovered: prospects.filter((p) => p.status === "new").length,
      drafted: prospects.filter((p) => p.status === "drafted").length,
      contacted: prospects.filter((p) => p.status === "contacted").length,
    },
  };
}

export function buildCoverageMatrix(
  rows: RankRow[],
  gapRows: Array<{
    keyword: string;
    volume: number | null;
    intent: string | null;
    sitePosition: number | null;
    competitorHost: string;
  }>,
) {
  const latestDate = [...new Set(rows.map((r) => r.capturedOn))].sort().at(-1);
  const latest = rows.filter((r) => r.capturedOn === latestDate);
  const markets = [...new Set(latest.map((r) => String(r.locationCode)))];
  const services = [
    ...new Set(
      latest.flatMap((r) =>
        r.tags.length
          ? r.tags
          : [r.intent ?? r.keyword.split(" ").slice(0, 2).join(" ")],
      ),
    ),
  ].slice(0, 20);
  return {
    markets,
    services,
    cells: services.flatMap((service) =>
      markets.map((market) => {
        const matches = latest.filter(
          (r) =>
            String(r.locationCode) === market &&
            (r.tags.includes(service) ||
              r.intent === service ||
              r.keyword.includes(service)),
        );
        const gap = gapRows.filter(
          (r) => r.intent === service || r.keyword.includes(service),
        );
        const best = Math.min(101, ...matches.map((r) => r.position ?? 101));
        return {
          service,
          market,
          state: !matches.length ? "missing" : best <= 10 ? "strong" : "weak",
          bestPosition: best === 101 ? null : best,
          demand: gap.reduce((s, r) => s + (r.volume ?? 0), 0),
          targetUrl: matches.find((r) => r.targetUrl)?.targetUrl ?? null,
        };
      }),
    ),
  };
}

export function buildForecasts(work: Work[]) {
  const groups = new Map<string, number[]>();
  for (const item of work) {
    const v = item.verification as VerificationState;
    if (v.outcome !== "won" || !item.executionType) continue;
    const base = v.baseline?.metrics.find(
      (m) => m.key === "clicks" || m.key === "conversions",
    );
    const last = [...(v.checkpoints ?? [])]
      .filter((c) => c.status === "recorded")
      .sort((a, b) => b.day - a.day)[0]
      ?.metrics?.find((m) => m.key === base?.key);
    if (base && last && base.value > 0)
      groups.set(item.executionType, [
        ...(groups.get(item.executionType) ?? []),
        ((last.value - base.value) / base.value) * 100,
      ]);
  }
  return [...groups].map(([executionType, values]) => {
    const samples = values.length;
    const average = samples ? values.reduce((a, b) => a + b, 0) / samples : 0;
    const eligible = samples >= 3;
    return {
      executionType,
      samples,
      eligible,
      confidence:
        samples >= 8 ? "high" : samples >= 3 ? "medium" : "insufficient",
      assumption:
        "Based only on verified winning actions of the same type; it does not include seasonality or external market changes.",
      conservative: eligible ? round(average * 0.5) : null,
      base: eligible ? round(average) : null,
      upside: eligible ? round(average * 1.5) : null,
    };
  });
}

function visibility(position: number | null) {
  return position == null ? 0 : Math.max(0, 101 - position);
}
function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function round(v: number) {
  return Math.round(v * 10) / 10;
}
function pages(rows: Record<string, unknown>[]) {
  return rows
    .map((p) => ({
      url: String(p.url ?? ""),
      traffic: num(p.traffic),
      keywords: num(p.keywords),
      trafficCost: num(p.trafficCost),
    }))
    .filter((p) => p.url);
}
