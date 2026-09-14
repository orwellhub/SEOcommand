import "server-only";
import { trafficRequestPlan, type TrafficInput } from "@/lib/traffic-research";
/** No paid collection is enabled until the owner has approved the API contract. */
export function prepareTrafficConnection(input:TrafficInput){
 return {...trafficRequestPlan(input),status:process.env.SIMILARWEB_API_KEY?"contract_approval_required":"credentials_required",configured:Boolean(process.env.SIMILARWEB_API_KEY),collectionEnabled:false,priceUsd:null,requirements:["Similarweb REST API subscription with total visits and desktop + mobile channel endpoints","Server-side SIMILARWEB_API_KEY","Confirmed subscription price, charging model and monthly limit","Explicit approval before the first paid collection"]};
}
