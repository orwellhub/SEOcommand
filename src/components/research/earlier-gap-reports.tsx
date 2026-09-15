"use client";
import {useState} from "react";
import {useJson} from "@/lib/use-live";
import type {CommandRecord} from "@/lib/command-model";
import type {GapKeyword} from "@/lib/domain-comparison";
import {DataTable} from "@/components/ui/data-table";
export function EarlierGapReports({site}:{site:string}){
 const saved=useJson<{records:CommandRecord[]}>(`/api/keyword-gap?site=${site}`),[selected,setSelected]=useState("");const record=saved.data?.records.find(row=>row.id===selected),domains=(record?.payload.input as {domains?:string[]}|undefined)?.domains??[],rows=(record?.payload.rows??[]) as GapKeyword[];
 return <details className="rounded border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">Earlier saved gap reports ({saved.data?.records.length??0})</summary><div className="mt-3 space-y-3"><p className="text-xs text-muted">Previous collections remain available with their original evidence. Individual domain reports are also available in Domain Overview.</p><select aria-label="Earlier saved gap report" className="h-9 max-w-full rounded border border-border bg-card px-3 text-xs" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose an earlier report</option>{saved.data?.records.map(row=><option key={row.id} value={row.id}>{new Date(row.createdAt).toLocaleString()} · {((row.payload.input as {domains?:string[]})?.domains??[]).join(" / ")}</option>)}</select>{saved.error&&<p role="alert" className="text-xs text-critical">{saved.error}</p>}{record&&<DataTable rows={rows} columns={[{key:"keyword",header:"Keyword",render:row=>row.keyword},{key:"volume",header:"Volume",render:row=>row.volume??"—"},...domains.map(host=>({key:host,header:host,render:(row:GapKeyword)=>row.positions[host]?.position??(row.positions[host]?.known?"Not observed":"Unknown")}))]} rowKey={row=>row.keyword} exportName="saved-keyword-gap"/>}</div></details>;
}
