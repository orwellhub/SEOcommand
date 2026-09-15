import type { DerivedRecommendation, DomainLiveBundle } from "./live";

/** Correct generated advice without changing saved recommendation IDs or work decisions. */
export function qualifyRecommendations(bundle: DomainLiveBundle): DerivedRecommendation[] {
  return (bundle.datasets.recommendations?.data ?? []).map((recommendation) => {
    if (!/striking-distance queries|queries ranking 4–20/.test(recommendation.title)) return recommendation;
    const source = bundle.datasets.striking_distance;
    const rows = (source?.data ?? []).filter((row) => row.position >= 4 && row.position <= 20 && row.impressions > 0);
    const pageOne = rows.filter((row) => row.position > 10);
    const topThree = rows.filter((row) => row.position <= 10);
    const top = [...rows].sort((a, b) => b.impressions - a.impressions).slice(0, 3);
    return { ...recommendation,
      title: `Review ${rows.length} queries ranking 4–20`,
      confidence: "medium",
      priorityScore: Math.min(85, 45 + Math.round(Math.log10(1 + rows.reduce((sum, row) => sum + row.impressions, 0)) * 8)),
      evidence: `${pageOne.length} queries rank 11–20 and could reach page one; ${topThree.length} already rank 4–10 and need a top-three or click-through improvement. Evidence through ${source?.provenance.rangeEnd ?? source?.capturedOn ?? "an unknown date"}. Validate the current ranking, relevant page and search intent before approval.`,
      estImpact: top.length ? `Highest measured demand: ${top.map((row) => `${row.query} (position ${row.position.toFixed(1)}, ${row.impressions} impressions)`).join("; ")}. No traffic gain is guaranteed.` : "Collect current query evidence before approving this work.",
    };
  });
}

export function normalizedHost(value: string): string {
  return value.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
}
