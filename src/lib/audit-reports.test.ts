import {describe,expect,it} from "vitest";
import {compareAudits,type AuditSnapshot} from "./audit-reports";
import {normalizeOnPageHealth,ON_PAGE_ISSUE_CHECKS} from "@/providers/dataforseo/normalizers";
import {normalizeSavedSnapshot} from "./snapshot-quality";
import type {TechnicalIssue,Provenance} from "./types";
const issue={id:"one",title:"Broken links",category:"Internal linking",severity:"high",affectedPages:4} as TechnicalIssue;
const audit=(patch:Partial<AuditSnapshot>={}):AuditSnapshot=>({date:"2026-08-01",collectedAt:"2026-08-01",healthScore:90,methodologyVersion:3,issues:[issue],crawlRun:{id:"one",domainId:"test",startedAt:"2026-08-01",completedAt:"2026-08-01",pagesCrawled:100,healthScore:90,newIssues:0,resolvedIssues:0,status:"completed"},...patch});
describe("crawl report accuracy",()=>{
 it("does not call successful URL checks failures, and reads summary counts from their actual level",()=>{const report=normalizeOnPageHealth({crawl_progress:"finished",page_metrics:{onpage_score:94,broken_links:3,duplicate_title:2,checks:{seo_friendly_url_characters_check:100,is_https:100,no_title:1}}});expect(report.issues.map(row=>row.id)).toEqual(expect.arrayContaining(["onpage-broken_links","onpage-duplicate_title","onpage-no_title"]));expect(report.issues).toHaveLength(3);expect(ON_PAGE_ISSUE_CHECKS).not.toContain("seo_friendly_url_characters_check");});
 it("filters the known historical false positive on read without rewriting saved evidence",()=>{const stored={dataset:"onpage",payload:{methodologyVersion:2,issues:[{id:"onpage-seo_friendly_url_characters_check",title:"Non SEO-friendly URL characters"},issue]},provenance:{} as Provenance};expect(normalizeSavedSnapshot(stored).payload.issues).toEqual([issue]);expect(stored.payload.issues).toHaveLength(2);});
 it("withholds occurrence change when crawl sizes or normalizers differ",()=>{expect(compareAudits(audit(),audit({methodologyVersion:2,issues:[]}))[0].change).toBeNull();expect(compareAudits(audit(),audit({crawlRun:null,issues:[]}))[0].change).toBeNull();expect(compareAudits(audit(),audit({issues:[{...issue,affectedPages:2}]}))[0].change).toBe(-2);});
});
