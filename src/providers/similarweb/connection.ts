import "server-only";
import { trafficRequestPlan,trafficDetailPlan,type TrafficInput,type TrafficReport } from "@/lib/traffic-research";
/** A key does not authorize subscription spend. Each report's entitlement is explicit. */
export function prepareTrafficConnection(input:TrafficInput,report:TrafficReport="overview"){
 const plan=report==="overview"?trafficRequestPlan(input):trafficDetailPlan(input,report);
 const entitled=report==="overview"||process.env[report==="pages"?"SIMILARWEB_POPULAR_PAGES_APPROVED":"SIMILARWEB_GEOGRAPHY_APPROVED"]==="true";
 const collectionEnabled=process.env.SIMILARWEB_CONTRACT_APPROVED==="true"&&Boolean(process.env.SIMILARWEB_API_KEY)&&Number(process.env.SIMILARWEB_MONTHLY_CREDIT_LIMIT)>=plan.credits&&entitled;
 return {...plan,report,status:collectionEnabled?"ready":process.env.SIMILARWEB_API_KEY?"contract_approval_required":"credentials_required",configured:Boolean(process.env.SIMILARWEB_API_KEY),collectionEnabled,priceUsd:null,requirements:[report==="pages"?"Similarweb Popular Pages add-on, explicitly approved":report==="countries"?"Similarweb total-geography API entitlement, explicitly approved":"Similarweb REST API subscription with total visits and desktop + mobile channels","Server-side Similarweb API credentials","Confirmed subscription price and approved monthly credit limit"]};
}
