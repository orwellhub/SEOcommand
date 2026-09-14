"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Database } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export function useReportView<T extends string>(views: readonly T[], fallback: T, legacyHashes?: Partial<Record<string, T>>) {
  const pathname = usePathname(), params = useSearchParams(), router = useRouter();
  const [hash, setHash] = useState("");
  useEffect(() => { const sync = () => setHash(window.location.hash); sync(); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync); }, [pathname, params]);
  const value = params.get("view") ?? legacyHashes?.[hash];
  const view = views.includes(value as T) ? value as T : fallback;
  function setView(next: T) { const query = new URLSearchParams(params); query.set("view", next); query.delete("feature"); router.push(`${pathname}?${query}`, { scroll: false }); }
  return [view, setView] as const;
}

export function ReportTabs<T extends string>({ items, value, onChange, label = "Report views" }: { items: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void; label?: string }) {
  const container = useRef<HTMLElement>(null);
  useEffect(() => { const nav = container.current; const selected = nav?.querySelector<HTMLElement>('[aria-current="page"]'); if (nav && selected) nav.scrollLeft = selected.offsetLeft - (nav.clientWidth - selected.clientWidth) / 2; }, [value]);
  return <nav ref={container} aria-label={label} className="relative flex gap-5 overflow-x-auto border-b border-border">{items.map((item) => <button key={item.id} aria-current={value === item.id ? "page" : undefined} onClick={() => onChange(item.id)} className={cn("relative min-h-10 shrink-0 whitespace-nowrap border-b-2 px-0.5 pb-2 pt-1 text-[13px] font-semibold", value === item.id ? "border-purple text-purple" : "border-transparent text-muted hover:border-border hover:text-ink")}>{item.label}</button>)}</nav>;
}

export function MissingChart({ message, height = "h-52" }: { message: string; height?: string }) {
  return <div role="img" aria-label={`Chart unavailable. ${message}`} className={cn("relative m-4 flex items-center justify-center border-b border-l border-border", height)}><div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col justify-between">{[1,2,3,4].map((line) => <div key={line} className="border-t border-dashed border-border/60" />)}</div><div className="relative max-w-xs rounded-md border border-border bg-card px-5 py-4 text-center"><Database className="mx-auto mb-2 h-4 w-4 text-muted" /><p className="text-sm font-semibold text-ink">Data unavailable</p><p className="mt-1 text-xs leading-5 text-muted">{message}</p></div></div>;
}

export function ReportMetric({ label, value, note, href }: { label: string; value?: string | number | null; note?: string; href?: string }) {
  const content = <><span className="block text-xs text-muted">{label}</span><span className="mt-1 flex items-center gap-1 text-[26px] font-semibold leading-9 tracking-tight tnum">{value ?? "—"}{href && <ArrowUpRight className="h-3.5 w-3.5 text-muted" />}</span><span className="mt-0.5 block text-[11px] leading-4 text-muted">{value == null ? note ?? "Unavailable" : note ?? ""}</span></>;
  return href ? <Link href={href} className="report-metric block min-w-0 p-4 transition-colors hover:bg-workspace">{content}</Link> : <div className="report-metric min-w-0 p-4">{content}</div>;
}

export function UnavailableReport({ title, description, metrics }: { title: string; description: string; metrics: string[] }) {
  return <Card className="overflow-hidden"><CardHeader title={title} subtitle={description} /><div className="grid grid-cols-2 divide-x divide-border lg:grid-cols-4">{metrics.map((label) => <ReportMetric key={label} label={label} />)}</div><MissingChart message={description} /></Card>;
}
