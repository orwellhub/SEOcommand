import {describe,it,expect} from "vitest";
import {competitorCitationGaps} from "./ai-research";
const observation={id:"1",prompt:"Which bus operator?",platform:"chatgpt",mentioned:false,capturedAt:"2026-09-15",citations:[{domain:"source.com",url:"https://source.com/a",owned:false}],entities:[{name:"Competitor",host:"competitor.com",owned:false,entityType:"competitor"}]};
describe("AI citation evidence",()=>{
 it("does not call every external source a competitor opportunity",()=>{expect(competitorCitationGaps([{...observation,entities:[]},{...observation,mentioned:true}])).toEqual([]);});
 it("counts unique responses and preserves source and competitor evidence",()=>{const gap=competitorCitationGaps([{...observation,citations:[...observation.citations,...observation.citations]}])[0];expect(gap.checks).toBe(1);expect(gap.competitors).toEqual(["Competitor"]);expect(gap.urls).toEqual(["https://source.com/a"]);});
});
