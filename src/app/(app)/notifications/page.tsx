"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button, Card, EmptyState, SeverityBadge, StatusBadge } from "@/components/ui/primitives";

interface Notice {
  id: string;
  siteSlug: string | null;
  eventType: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string | null;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    fetch("/api/notifications")
      .then((response) => response.json())
      .then((body) => setItems(body.items ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function mark(item: Notice, read = true) {
    const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, read }) });
    if (response.ok) setItems((values) => values.map((value) => value.id === item.id ? { ...value, readAt: read ? new Date().toISOString() : null } : value));
  }

  return <div className="animate-in space-y-5">
    <PageHeader title="Notification centre" description="Ranking, technical, traffic and backlink alerts across the portfolio." />
    {loading ? <Card className="h-64 animate-pulse" /> : items.length === 0 ? <EmptyState title="No alerts yet" description="New ranking drops, crawl regressions, traffic changes and backlink events will appear here." icon={<Bell className="h-6 w-6" />} /> : (
      <Card className="divide-y divide-border overflow-hidden">
        {items.map((item) => <article key={item.id} className={`flex gap-4 p-4 ${item.readAt ? "bg-card" : "bg-purple/[0.025]"}`}>
          <div className="pt-0.5"><SeverityBadge severity={item.severity} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-ink">{item.title}</h2>{item.siteSlug && <StatusBadge label={item.siteSlug} tone="info" />}</div>
            {item.detail && <p className="mt-1 text-xs text-muted">{item.detail}</p>}
            <div className="mt-2 flex items-center gap-3 text-2xs text-muted"><time>{new Date(item.createdAt).toLocaleString()}</time><span className="capitalize">{item.eventType.replace(/_/g, " ")}</span></div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {item.actionUrl && <Link href={item.actionUrl} className="rounded p-2 text-muted hover:bg-workspace hover:text-ink" aria-label="Open alert"><ExternalLink className="h-4 w-4" /></Link>}
            {!item.readAt && <Button variant="ghost" size="sm" onClick={() => mark(item)}><CheckCheck className="h-4 w-4" /> Mark read</Button>}
          </div>
        </article>)}
      </Card>
    )}
  </div>;
}
