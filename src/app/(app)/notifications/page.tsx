"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, Clock3, ExternalLink, Inbox, RotateCcw, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Card, EmptyState, SeverityBadge, Skeleton, StatusBadge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

interface Notice {
  id: string; siteSlug: string | null; eventType: string;
  severity: "critical" | "high" | "medium" | "low"; title: string; detail: string | null;
  actionUrl: string | null; status: string; readAt: string | null; snoozedUntil: string | null; createdAt: string;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "snoozed" | "history">("open");

  function load() {
    setLoading(true);
    fetch("/api/notifications").then((response) => response.json()).then((body) => setItems(body.items ?? [])).finally(() => setLoading(false));
  }
  useEffect(load, []);

  const visible = useMemo(() => items.filter((item) => filter === "history" ? ["resolved", "dismissed"].includes(item.status) : item.status === filter), [filter, items]);
  async function update(item: Notice, action: "resolve" | "dismiss" | "snooze" | "reopen") {
    const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, action }) });
    if (response.ok) load();
  }

  const counts = {
    open: items.filter((item) => item.status === "open").length,
    snoozed: items.filter((item) => item.status === "snoozed").length,
    history: items.filter((item) => ["resolved", "dismissed"].includes(item.status)).length,
  };

  return <div className="animate-in space-y-6">
    <PageHeader title="Notification centre" description="A controlled lifecycle for ranking, technical, traffic, reliability and authority alerts across the portfolio." />
    <div className="grid gap-3 sm:grid-cols-3">
      <FilterCard label="Open" value={counts.open} icon={<Inbox />} color="#FF6B5E" active={filter === "open"} onClick={() => setFilter("open")} />
      <FilterCard label="Snoozed" value={counts.snoozed} icon={<Clock3 />} color="#F2B544" active={filter === "snoozed"} onClick={() => setFilter("snoozed")} />
      <FilterCard label="History" value={counts.history} icon={<CheckCircle2 />} color="#16A879" active={filter === "history"} onClick={() => setFilter("history")} />
    </div>
    {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-28" key={index} />)}</div> : visible.length === 0 ? <EmptyState title={filter === "open" ? "No open alerts" : `No ${filter} alerts`} description="The notification centre will keep this view updated as monitoring jobs run." icon={<Bell className="h-6 w-6" />} /> : (
      <Card className="divide-y divide-border overflow-hidden">
        {visible.map((item) => <article key={item.id} className={cn("grid gap-4 p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto]", item.status === "open" && !item.readAt && "bg-purple/[0.025]")}>
          <div className="pt-0.5"><SeverityBadge severity={item.severity} /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold text-ink">{item.title}</h2>{item.siteSlug && <StatusBadge label={item.siteSlug} tone="info" />}<StatusBadge label={item.status} tone={item.status === "resolved" ? "success" : item.status === "dismissed" ? "neutral" : item.status === "snoozed" ? "warning" : "critical"} /></div>
            {item.detail && <p className="mt-1.5 text-xs leading-5 text-muted">{item.detail}</p>}
            <div className="mt-2 flex items-center gap-3 text-2xs text-muted"><time>{new Date(item.createdAt).toLocaleString()}</time><span className="capitalize">{item.eventType.replace(/_/g, " ")}</span>{item.snoozedUntil && <span>Returns {new Date(item.snoozedUntil).toLocaleString()}</span>}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1 self-center">
            {item.actionUrl && <Link href={item.actionUrl} className="rounded p-2 text-muted hover:bg-workspace hover:text-ink" aria-label="Open evidence"><ExternalLink className="h-4 w-4" /></Link>}
            {item.status === "open" && <><Button variant="ghost" size="sm" onClick={() => update(item, "snooze")}><Clock3 className="h-4 w-4" /> Snooze</Button><Button variant="ghost" size="sm" onClick={() => update(item, "dismiss")}><XCircle className="h-4 w-4" /> Dismiss</Button><Button size="sm" onClick={() => update(item, "resolve")}><CheckCircle2 className="h-4 w-4" /> Resolve</Button></>}
            {item.status !== "open" && <Button variant="ghost" size="sm" onClick={() => update(item, "reopen")}><RotateCcw className="h-4 w-4" /> Reopen</Button>}
          </div>
        </article>)}
      </Card>
    )}
  </div>;
}

function FilterCard({ label, value, icon, color, active, onClick }: { label: string; value: number; icon: React.ReactNode; color: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={cn("surface-lift rounded-lg border bg-card p-4 text-left shadow-card", active ? "border-purple ring-2 ring-purple/10" : "border-border")}><div className="flex items-center justify-between"><div><div className="text-2xs font-bold uppercase tracking-wider text-muted">{label}</div><div className="mt-1 text-2xl font-extrabold text-ink tnum">{value}</div></div><span className="flex h-10 w-10 items-center justify-center rounded-md" style={{ background: `${color}18`, color }}>{icon}</span></div></button>;
}
