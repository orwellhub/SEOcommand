import {commandRecords,saveCommandRecord} from "./command-store";
import type {RankCampaign,TrackedKeyword,RankObservation} from "@/lib/rank-reports";
export type RankWorkspace={campaigns:RankCampaign[];keywords:TrackedKeyword[];history:RankObservation[]};
export async function rankPreview(site:string):Promise<RankWorkspace>{
 const saved=(await commandRecords(site)).find(row=>row.kind==="qa_rank_workspace");if(saved)return saved.payload as unknown as RankWorkspace;
 const campaignId="97000000-0000-4000-8000-000000000001",date=new Date().toISOString().slice(0,10);
 const keywords:TrackedKeyword[]=["bus rental","coach hire","charter bus","minibus hire","airport transfer","group transport"].map((keyword,i)=>({id:`98000000-0000-4000-8000-00000000000${i+1}`,keyword,campaignId,locationCode:i<3?2840:2826,languageCode:"en",device:i%2?"mobile":"desktop",searchEngine:"google",tags:[i<3?"Core":"Local"],targetUrl:null,active:true,cadence:"weekly"}));
 const workspace:RankWorkspace={campaigns:[{id:campaignId,name:"Core services",competitors:["competitor.example"],defaultCadence:"weekly",alertThreshold:5,updatedAt:new Date().toISOString()}],keywords,history:Array.from({length:8},(_,day)=>keywords.map((k,i)=>({trackedKeywordId:k.id,capturedOn:new Date(Date.parse(date)-(7-day)*86400000).toISOString().slice(0,10),position:Math.max(1,18-i-day),url:`https://${site}.example/${i<3?"services":"locations"}`,serpFeatures:["organic",...(i%2?["featured_snippet"]:[])],ownedFeatures:day>5&&i===1?["featured_snippet"]:[],competitors:[{host:"competitor.example",position:3+i,url:"https://competitor.example/service"}]}))).flat()};
 await saveRankPreview(site,workspace);return workspace;
}
export async function saveRankPreview(site:string,value:RankWorkspace){await saveCommandRecord(site,"qa_rank_workspace","workspace",value as unknown as Record<string,unknown>);}
