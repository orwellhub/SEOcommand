export type SerpHistoryRow = { trackedKeywordId: string; keyword: string; capturedOn: string; position: number | null; previousPosition: number | null; url: string | null; serpFeatures: string[]; ownedFeatures: string[]; intent: string | null; competitors: Array<{ host: string; position: number; url: string | null }>; device: string; locationCode: number };

export function buildSerpIntelligence(rows: SerpHistoryRow[]) {
  const ordered = [...rows].sort((a, b) => a.capturedOn.localeCompare(b.capturedOn));
  const dates = [...new Set(ordered.map((row) => row.capturedOn))];
  const byDate = dates.map((date) => {
    const points = ordered.filter((row) => row.capturedOn === date);
    const movements = points.filter((row) => row.position != null && row.previousPosition != null).map((row) => Math.abs(row.position! - row.previousPosition!));
    const featureSet = new Set(points.flatMap((row) => row.serpFeatures));
    const ownedSet = new Set(points.flatMap((row) => row.ownedFeatures));
    return { date, volatility: movements.length ? Math.round(movements.reduce((sum, value) => sum + value, 0) / movements.length * 10) / 10 : 0, keywords: points.length, features: [...featureSet], ownedFeatures: [...ownedSet], avgPosition: average(points.map((row) => row.position)) };
  });
  const keywordGroups = new Map<string, SerpHistoryRow[]>();
  for (const row of ordered) keywordGroups.set(row.trackedKeywordId, [...(keywordGroups.get(row.trackedKeywordId) ?? []), row]);
  const alerts: Array<{ id: string; date: string; type: "volatility" | "intent_change" | "feature_change" | "competitor_takeover"; severity: "high" | "medium"; title: string; detail: string; keyword?: string }> = [];
  for (const day of byDate) if (day.volatility >= 4) alerts.push({ id: `volatility:${day.date}`, date: day.date, type: "volatility", severity: day.volatility >= 8 ? "high" : "medium", title: `SERP volatility reached ${day.volatility}`, detail: `Average absolute movement across ${day.keywords} tracked keyword${day.keywords === 1 ? "" : "s"}.` });
  const keywords = [...keywordGroups.values()].map((history) => {
    for (let index = 1; index < history.length; index += 1) {
      const before = history[index - 1]!, current = history[index]!;
      if (before.intent && current.intent && before.intent !== current.intent) alerts.push({ id: `intent:${current.trackedKeywordId}:${current.capturedOn}`, date: current.capturedOn, type: "intent_change", severity: "high", title: `Intent changed for “${current.keyword}”`, detail: `${before.intent} → ${current.intent}`, keyword: current.keyword });
      const gained = current.ownedFeatures.filter((feature) => !before.ownedFeatures.includes(feature)); const lost = before.ownedFeatures.filter((feature) => !current.ownedFeatures.includes(feature));
      if (gained.length || lost.length) alerts.push({ id: `feature:${current.trackedKeywordId}:${current.capturedOn}`, date: current.capturedOn, type: "feature_change", severity: lost.length ? "high" : "medium", title: `${lost.length ? "Lost" : "Gained"} SERP feature for “${current.keyword}”`, detail: [...lost.map((value) => `Lost ${value}`), ...gained.map((value) => `Gained ${value}`)].join(" · "), keyword: current.keyword });
      const beforeLeader = before.competitors[0]?.host, currentLeader = current.competitors[0]?.host;
      if (beforeLeader && currentLeader && beforeLeader !== currentLeader) alerts.push({ id: `takeover:${current.trackedKeywordId}:${current.capturedOn}`, date: current.capturedOn, type: "competitor_takeover", severity: "medium", title: `New competitor leader for “${current.keyword}”`, detail: `${currentLeader} replaced ${beforeLeader}`, keyword: current.keyword });
    }
    const latest = history.at(-1)!; const first = history[0]!;
    return { id: latest.trackedKeywordId, keyword: latest.keyword, device: latest.device, locationCode: latest.locationCode, position: latest.position, change: latest.position != null && first.position != null ? first.position - latest.position : null, intent: latest.intent, url: latest.url, features: latest.serpFeatures, ownedFeatures: latest.ownedFeatures, history: history.map((row) => ({ date: row.capturedOn, position: row.position, intent: row.intent, features: row.serpFeatures, ownedFeatures: row.ownedFeatures, leader: row.competitors[0]?.host ?? null })) };
  });
  const latestDate = dates.at(-1); const previousDate = dates.at(-2);
  const competitorHosts = [...new Set(ordered.filter((row) => row.capturedOn === latestDate).flatMap((row) => row.competitors.map((item) => item.host)))];
  const competitors = competitorHosts.map((host) => { const latest = ordered.filter((row) => row.capturedOn === latestDate).flatMap((row) => row.competitors.filter((item) => item.host === host)); const previous = ordered.filter((row) => row.capturedOn === previousDate).flatMap((row) => row.competitors.filter((item) => item.host === host)); const avgPosition = average(latest.map((item) => item.position)); const priorPosition = average(previous.map((item) => item.position)); return { host, keywordCoverage: latest.length, top3: latest.filter((item) => item.position <= 3).length, avgPosition, movement: avgPosition != null && priorPosition != null ? priorPosition - avgPosition : null }; }).sort((a, b) => b.keywordCoverage - a.keywordCoverage || (a.avgPosition ?? 101) - (b.avgPosition ?? 101));
  const latest = byDate.at(-1);
  return { summary: { trackedKeywords: keywords.length, historyDays: dates.length, volatility: latest?.volatility ?? 0, intentChanges: alerts.filter((item) => item.type === "intent_change").length, ownedFeatures: latest?.ownedFeatures.length ?? 0, activeCompetitors: competitors.length }, weather: byDate, keywords: keywords.sort((a, b) => (a.position ?? 101) - (b.position ?? 101)), competitors, alerts: alerts.sort((a, b) => b.date.localeCompare(a.date)) };
}

function average(values: Array<number | null>) { const valid = values.filter((value): value is number => value != null); return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length * 10) / 10 : null; }
