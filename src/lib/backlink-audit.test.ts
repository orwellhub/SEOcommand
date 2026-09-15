import {describe,expect,it} from "vitest";
import {decisionFor,disavowText,type BacklinkDecision} from "./backlink-audit";
const row:BacklinkDecision={sourceUrl:"https://source.com/page#part",targetUrl:"https://target.com",scope:"domain",decision:"disavow",note:"Reviewed"};
describe("backlink decisions",()=>{
 it("exports only explicitly selected decisions with valid entries",()=>{expect(disavowText([row,row,{...row,decision:"whitelist"},{...row,sourceUrl:"javascript:alert(1)"}])).toBe("# SEO Command: reviewed disavow candidates\ndomain:source.com\n");});
 it("keeps URL and whole-domain decisions distinct and honours the latest",()=>{const domain={...row,updatedAt:"2026-09-14"},url={...row,sourceUrl:"https://source.com/other",scope:"url" as const,decision:"whitelist" as const,updatedAt:"2026-09-15"};expect(decisionFor(url.sourceUrl,url.targetUrl,[domain,url])?.decision).toBe("whitelist");expect(decisionFor("https://source.com/another",url.targetUrl,[domain,url])?.decision).toBe("disavow");});
});

it("omits domain-wide disavowal when a newer URL is whitelisted",()=>{const domain={...row,updatedAt:"2026-09-14"},url={...row,sourceUrl:"https://source.com/other",scope:"url" as const,decision:"whitelist" as const,updatedAt:"2026-09-15"};const exported=disavowText([domain,url]);expect(exported).toContain("# Omitted domain:source.com");expect(exported.split("\n")).not.toContain("domain:source.com");});
it("does not export a source URL whitelisted for another destination",()=>{const a={...row,scope:"url" as const,updatedAt:"2026-09-14"},b={...a,targetUrl:"https://target.com/other",decision:"whitelist" as const,updatedAt:"2026-09-15"};expect(disavowText([a,b]).split("\n")).not.toContain("https://source.com/page");});
