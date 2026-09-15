export type ResearchTarget={value:string;scope:"domain"|"subdomain"|"folder"|"url";kind:"organic"|"paid"|"shopping"};
export type NormalTarget=ResearchTarget&{id:string;host:string};
export function normalizeResearchTarget(input:ResearchTarget):NormalTarget{
 const url=new URL(input.value.includes("://")?input.value:`https://${input.value}`);
 if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.port||!url.hostname.includes(".")||!/^([a-z0-9-]+\.)+[a-z0-9-]+$/i.test(url.hostname))throw new Error("Enter a public domain or HTTP website URL.");
 url.hash="";const host=url.hostname.toLowerCase().replace(/^www\./,"");
 const value=input.scope==="domain"||input.scope==="subdomain"?host:input.scope==="folder"?`${url.origin}${url.pathname.replace(/\/$/,"")}/`:url.toString();
 return {...input,value,host,id:`${input.scope}:${input.kind}:${value}`};
}
export function targetMatches(target:NormalTarget,value:string){try{const url=new URL(value),host=url.hostname.toLowerCase().replace(/^www\./,"");if(target.scope==="domain")return host===target.host||host.endsWith(`.${target.host}`);if(host!==target.host)return false;if(target.scope==="subdomain")return true;const expected=new URL(target.value);if(target.scope==="url")return url.origin===expected.origin&&url.pathname===expected.pathname&&url.search===expected.search;return url.origin===expected.origin&&(url.pathname===expected.pathname.slice(0,-1)||url.pathname.startsWith(expected.pathname));}catch{return false;}}
export function targetRequest(target:NormalTarget){
 const filters:unknown[]=[];
 if(target.scope==="folder"){const path=new URL(target.value).pathname;filters.push([["ranked_serp_element.serp_item.relative_url","=",path.slice(0,-1)||"/"],"or",["ranked_serp_element.serp_item.relative_url","like",`${path}%`]]);}
 if(target.scope==="subdomain")filters.push(["ranked_serp_element.serp_item.url","regex",`^https?://(www\\.)?${target.host.replace(/\./g,"\\.")}/`]);
 return {target:target.scope==="url"?target.value:target.host,item_types:[target.kind],...(filters.length?{filters}:{}),include_serp_info:true,order_by:["keyword_data.keyword_info.search_volume,desc"]};
}
