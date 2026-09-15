import { fetchPublic } from "./public-network";
import { benchmarkHtml, type ContentBenchmark } from "@/lib/content-analysis";
export async function readPageBenchmark(url:string):Promise<ContentBenchmark>{
 const response=await fetchPublic(url,{signal:AbortSignal.timeout(12000),headers:{"user-agent":"SEOCommand/2.0 (+page comparison)"}});
 if(!response.ok)throw new Error(`Page returned HTTP ${response.status}.`);
 if(!response.headers.get("content-type")?.includes("html"))throw new Error("Page did not return HTML.");
 const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
 if(reader)try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2000000)throw new Error("Page exceeds the 2 MB comparison limit.");chunks.push(part.value);}}finally{await reader.cancel().catch(()=>undefined);}
 return benchmarkHtml(Buffer.concat(chunks).toString("utf8"),url);
}
