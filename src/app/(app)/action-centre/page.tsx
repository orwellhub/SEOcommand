"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, CheckCircle2, CirclePause, ListChecks, Sparkles, Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Card, EmptyState, SeverityBadge, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

interface ActionItem {
  id: string;
  kind: "alert" | "recommendation";
  siteSlug: string | null;
  siteName: string;
  title: string;
  detail: string | null;
  status: string;
  severity: "critical" | "high" | "medium" | "low";
  score: number;
  actionUrl: string | null;
  createdAt: string;
}

interface ActionData {
  items: ActionItem[];
  counts: { urgent: number; open: number; paused: number };
}

export default function ActionCentrePage() {
  const [data, setData] = useState<ActionData | null>(null);
  const [filter, setFilter] = useState<"all" | "urgent" | "alerts" | "recommendations">("all");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/action-centre").then((response) => response.json()).then(setData).finally(() => setLoading(false));
  }
  useEffect(load, []);

  const items = useMemo(() => (data?.items ?? []).filter((item) => {
    if (filter === "urgent") return item.score >= 75;
    if (filter === "alerts") return item.kind === "alert";
    if (filter === "recommendations") return item.kind === "recommendation";
    return true;
  }), [data, filter]);

  async function updateNotice(item: ActionItem, action: "resolve" | "snooze" | "dismiss") {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, action }),
    });
    if (response.ok) setData((current) => current ? { ...current, items: current.items.filter((value) => value.id !== item.id) } : current);
  }

  return (
    <div className="animate-in space-y-6">
      <PageHeader title="Action centre" description="One prioritised queue for portfolio risks, opportunities and approvals. Start here, then follow the evidence into the affected website." actions={<Button onClick={load}>Refresh signals</Button>} />

      <section className="grid gap-3 md:grid-cols-3">
        <SignalCard icon={<Zap className="h-5 w-5" />} label="Needs attention now" value={data?.counts.urgent ?? 0} note="Critical and high-priority signals" color="#FF6B5E" />
        <SignalCard icon={<ListChecks className="h-5 w-5" />} label="Open work" value={data?.counts.open ?? 0} note="Alerts and approved recommendations" color="#335CFF" />
        <SignalCard icon={<CirclePause className="h-5 w-5" />} label="Paused websites" value={data?.counts.paused ?? 0} note="Free checks continue where possible" color="#F2B544" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div><h2 className="text-base font-extrabold tracking-tight text-ink">Prioritised queue</h2><p className="text-2xs text-muted">Ordered by severity and impact—not arrival time alone.</p></div>
            <div className="flex rounded-md border border-border bg-workspace p-0.5">
              {(["all", "urgent", "alerts", "recommendations"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={cn("rounded px-2.5 py-1.5 text-2xs font-semibold capitalize", filter === value ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink")}>{value}</button>)}
            </div>
          </div>
          {loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24" />)}</div> : items.length === 0 ? <div className="p-5"><EmptyState title="Queue is clear" description="New risks and approved recommendations will appear here automatically." icon={<CheckCircle2 className="h-7 w-7 text-success" />} /></div> : <div className="divide-y divide-border">{items.map((item) => <article key={`${item.kind}-${item.id}`} className="group grid gap-4 px-5 py-4 hover:bg-workspace/60 sm:grid-cols-[8px_minmax(0,1fr)_auto]">
            <span className="hidden rounded-full sm:block" style={{ background: item.severity === "critical" ? "#FF5C62" : item.severity === "high" ? "#FF6B5E" : item.severity === "medium" ? "#F2B544" : "#12B8C4" }} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={item.severity} /><StatusBadge label={item.kind} tone={item.kind === "alert" ? "warning" : "info"} /><span className="text-2xs font-semibold text-muted">Priority {item.score}</span></div>
              <h3 className="mt-2 text-sm font-bold text-ink">{item.title}</h3>
              {item.detail && <p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p>}
              <div className="mt-2 flex items-center gap-2 text-2xs text-muted"><span>{item.siteName}</span><span>•</span><time>{new Date(item.createdAt).toLocaleDateString()}</time></div>
            </div>
            <div className="flex items-center gap-1 self-center">
              {item.kind === "alert" && <><Button variant="ghost" size="sm" onClick={() => updateNotice(item, "snooze")}>Snooze</Button><Button variant="ghost" size="sm" onClick={() => updateNotice(item, "resolve")}>Resolve</Button></>}
              <Link href={item.actionUrl || (item.siteSlug ? `/sites/${item.siteSlug}` : "/portfolio")} className="inline-flex h-8 items-center gap-1 rounded-md bg-ink px-2.5 text-xs font-semibold text-card">Open <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </article>)}</div>}
        </Card>

        <aside className="space-y-4">
          <Card className="overflow-hidden border-0 bg-ink p-5 text-card shadow-pop">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#12B8C4] text-white"><Sparkles className="h-5 w-5" /></div>
            <h2 className="mt-5 text-lg font-extrabold tracking-tight">A calmer operating rhythm</h2>
            <p className="mt-2 text-xs leading-5 text-card/65">Resolve urgent failures first, review high-impact growth opportunities next, then let scheduled monitoring watch the rest.</p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <MiniFlow value="1" label="Triage" color="#FF6B5E" /><MiniFlow value="2" label="Act" color="#F2B544" /><MiniFlow value="3" label="Verify" color="#16A879" />
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2"><BellRing className="h-4 w-4 text-[#FF6B5E]" /><h3 className="text-sm font-bold text-ink">Alert discipline</h3></div>
            <p className="mt-2 text-xs leading-5 text-muted">Snoozed items return automatically. Resolved and dismissed items remain in the audit trail, keeping the working queue focused.</p>
            <Link href="/notifications" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-purple">Open notification history <ArrowRight className="h-3.5 w-3.5" /></Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SignalCard({ icon, label, value, note, color }: { icon: React.ReactNode; label: string; value: number; note: string; color: string }) {
  return <Card className="surface-lift relative overflow-hidden p-5"><span className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} /><div className="flex items-start justify-between"><div><div className="text-2xs font-bold uppercase tracking-[0.12em] text-muted">{label}</div><div className="mt-2 text-3xl font-extrabold tracking-tight text-ink tnum">{value}</div><p className="mt-1 text-2xs text-muted">{note}</p></div><div className="rounded-md p-2.5" style={{ color, background: `${color}18` }}>{icon}</div></div></Card>;
}
function MiniFlow({ value, label, color }: { value: string; label: string; color: string }) {
  return <div className="rounded-md bg-card/10 p-2 text-center"><div className="mx-auto flex h-6 w-6 items-center justify-center rounded-full text-2xs font-bold text-white" style={{ background: color }}>{value}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-card/60">{label}</div></div>;
}
