import { expect, it } from "vitest";
import { rankReportRows, type TrackedKeyword, type RankObservation } from "./rank-reports";
import { rankingIntelligence, planningCtr, volumeKey } from "./rank-intelligence";
import { nextResearchPage, researchCanResume } from "./research-pagination";
import { reportDefinition } from "@/reports/definition";
import { reportDocumentCsv } from "@/reports/csv";
import { draftHtml, inlineContentGuidance } from "./content-guidance";
import type { ResearchUnit } from "./research-evidence";
const keyword = (id: string, device = "desktop"): TrackedKeyword => ({ id, keyword: "bus rental", campaignId: null, locationCode: 2826, languageCode: "en", device, searchEngine: "google", tags: [], targetUrl: null, active: true, cadence: "daily" });
const observation = (id: string, position: number | null): RankObservation => ({ trackedKeywordId: id, capturedOn: "2026-09-15", position, url: null, serpFeatures: [], ownedFeatures: [], competitors: [{ host: "competitor.test", position: 2, url: null }] });
const rows = (keys: TrackedKeyword[], points: RankObservation[]) => rankReportRows(keys, points, "2026-09-01", "2026-09-15");
it("calculates cohort estimates and bounded competitor share from matched volumes", () => {
 const result = rankingIntelligence(rows([keyword("1")], [observation("1", 1)]), {[volumeKey(keyword("1"))]:1000}, ["competitor.test"])[0]!;
 expect(result.visibility).toBe(100); expect(result.estimatedTraffic).toBe(280); expect(result.shareOfVoice).toBeCloseTo(280/430*100);
});
it("keeps missing checks and missing volume unknown", () => {
 const keys = [keyword("1"), {...keyword("2"), keyword:"coach hire"}];
 const partial = rankingIntelligence(rows(keys,[observation("1",1)]),{})[0]!;
 expect(partial.visibility).toBeNull();expect(partial.estimatedTraffic).toBeNull();
 const observed = rankingIntelligence(rows([keyword("1")],[observation("1",null)]),{})[0]!;
 expect(observed.visibility).toBe(0);expect(observed.estimatedTraffic).toBeNull();
});
it("does not duplicate search demand across devices and preserves known zero", () => {
 const keys = [keyword("1"), keyword("2","mobile")];
 expect(rankingIntelligence(rows(keys,[observation("1",1),observation("2",1)]),{[volumeKey(keys[0]!)]:100})[0]?.estimatedTraffic).toBeNull();
 expect(rankingIntelligence(rows([keys[0]!],[observation("1",1)]),{[volumeKey(keys[0]!)]:0})[0]?.estimatedTraffic).toBe(0);
 expect(planningCtr(101)).toBe(0);expect(planningCtr(null)).toBe(0);
});
const unit: ResearchUnit = {id:"domain",label:"globalbusrental.com",endpoint:"labsRankedKeywords",path:"/ranked",body:{offset:0,limit:1000},maxRows:1500,estimateUsd:.15,status:"completed",costUsd:.1};
it("continues from provider offsets without carrying paid request identifiers", () => {
 const next = nextResearchPage(unit,[{items:Array(1000).fill({}),total_count:5000}])!;
 expect(next.body).toMatchObject({offset:1000,limit:500});expect(next.status).toBeUndefined();expect(next.costUsd).toBeUndefined();
 expect(nextResearchPage(next,[{items:Array(500).fill({}),total_count:5000}])).toBeNull();
});
it("stops empty and exhausted pages and refuses malformed paid responses", () => {
 expect(nextResearchPage(unit,[{items:[],total_count:0}])).toBeNull();expect(nextResearchPage(unit,[{items:null,total_count:0}])).toBeNull();
 expect(nextResearchPage(unit,[{items:[{}],total_count:1}])).toBeNull();expect(()=>nextResearchPage(unit,[{}])).toThrow("incomplete");
});
it("resumes pending work but never an uncertain request", () => {
 expect(researchCanResume([unit,{...unit,status:undefined}])).toBe(true);
 expect(researchCanResume([unit,{...unit,status:"running"}])).toBe(false);expect(researchCanResume([unit])).toBe(false);
});
it("report definitions preserve valid section order and reject unsupported periods", () => {
 const d = reportDefinition("tpl-domain");const selected=[...d.sections].reverse();
 expect(reportDefinition("tpl-domain",{days:7,sections:[...selected,selected[0],"Unknown"]}).sections).toEqual(selected);
 expect(()=>reportDefinition("tpl-domain",{days:31})).toThrow();expect(()=>reportDefinition("invalid")).toThrow();
});
it("exports only report body evidence and neutralises CSV formulas", () => {
 const csv=reportDocumentCsv('<head><style>secret</style></head><main><h2>Global Bus Rental</h2><table><tr><th>Query</th><th>Clicks</th></tr><tr><td>=SUM(1)</td><td>63</td></tr></table></main>');
 expect(csv).toContain('"Global Bus Rental"');expect(csv).toContain('"\'=SUM(1)","63"');expect(csv).not.toContain('secret');
});
it("draft export escapes executable markup", () => {
 const html=draftHtml('# Title\n\n<script>alert(1)</script>');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');
});

it("inline guidance points at the exact draft text", () => { const text = "# Bus hire\n\n" + Array(35).fill("word").join(" ") + "."; const hint = inlineContentGuidance(text)[0]!; expect(text.slice(hint.start,hint.end).trim()).toBe(hint.text); expect(hint.kind).toBe("sentence"); });

import { scheduledSiteMode } from "@/sync/site-schedule";
it("refreshes provisioning Google data without activating paid tiers or paused websites", () => {
 expect(scheduledSiteMode({lifecycleStatus:"active",archivedAt:null})).toBe("full");
 for (const lifecycleStatus of ["approved","provisioning","error"] as const) expect(scheduledSiteMode({lifecycleStatus,archivedAt:null})).toBe("google");
 for (const lifecycleStatus of ["draft","forecast_pending","pre_launch","paused","archived"] as const) expect(scheduledSiteMode({lifecycleStatus,archivedAt:null})).toBeNull();
 expect(scheduledSiteMode({lifecycleStatus:"active",archivedAt:"2026-09-15"})).toBeNull();
});
it("keeps each metric and section in report CSV order", () => {
 const csv=reportDocumentCsv('<main><h3>Performance</h3><div class="metrics"><div class="metric"><span>Clicks</span><strong>223</strong></div><div class="metric"><span>Impressions</span><strong>8,094</strong></div></div><h3>Next actions</h3></main>');
 expect(csv).toContain('"Clicks","223"\r\n"Impressions","8,094"');
 expect(csv.indexOf('"Performance"')).toBeLessThan(csv.indexOf('"Clicks"'));expect(csv.indexOf('"Next actions"')).toBeGreaterThan(csv.indexOf('"Impressions"'));
});
