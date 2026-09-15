import { describe, expect, it } from "vitest";
import { aiCompetitorMatrix, aiSourceRows, type AiObservation } from "./ai-report-model";
const observation=(input:Partial<AiObservation>={}):AiObservation=>({id:"one",prompt:"Which bus company?",topic:"Transport",mentioned:false,entities:[],citations:[],capturedAt:"2026-09-15T00:00:00Z",platform:"chatgpt",...input} as AiObservation);
describe("AI report evidence",()=>{
 it("does not mark an entirely unobserved comparison as shared",()=>{const [row]=aiCompetitorMatrix([observation()],["rival.com"],"prompt");expect(row?.kind).toBe("unobserved");expect(row?.shared).toBe(false);});
 it("matches competitor hosts exactly and deduplicates observed answers",()=>{const row=observation({entities:[{name:"Rival",host:"www.rival.com",owned:false,entityType:"competitor"}] as AiObservation["entities"]});expect(aiCompetitorMatrix([row,row],["rival.com"],"prompt")[0]).toMatchObject({checks:1,own:0,rivals:[1],kind:"missing"});expect(aiCompetitorMatrix([row],["not-rival.com"],"prompt")[0]?.rivals).toEqual([0]);});
 it("counts a cited domain once per answer and retains distinct cited pages",()=>{const row=observation({citations:[{domain:"source.com",url:"https://source.com/a",owned:false},{domain:"source.com",url:"https://source.com/b",owned:false}] as AiObservation["citations"]});expect(aiSourceRows([row,row])[0]).toMatchObject({checks:1,urls:["https://source.com/a","https://source.com/b"]});expect(aiSourceRows([row],true)).toHaveLength(2);});
});
