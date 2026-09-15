"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { useJson } from "@/lib/use-live";
import { useCommandAction } from "@/components/command/shared";
import type { SiteCommand } from "@/lib/command-model";
import styles from "@/components/command/command.module.css";
export function CrawlSettings({ site }: { site: string }) {
  const state = useJson<SiteCommand>(`/api/command?site=${site}`), [value, setValue] = useState("");
  const [limit, setLimit] = useState(200), [depth, setDepth] = useState(10), [delay, setDelay] = useState(250);
  const action = useCommandAction(state.refresh, site);
  useEffect(() => { const payload = state.data?.records.find((r) => r.kind === "settings")?.payload; const exclusions = payload?.crawlExclusions; setLimit(Number(payload?.crawlPageLimit ?? 200)); setDepth(Number(payload?.crawlMaxDepth ?? 10)); setDelay(Number(payload?.crawlDelayMs ?? 250)); setValue(Array.isArray(exclusions) ? exclusions.join("\n") : ""); }, [state.data]);
  return <details className="rounded-lg border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-bold">Rendered crawl scope and exclusions</summary><div className="mt-3 space-y-3"><p className="text-xs text-muted">One path prefix per line, e.g. /account or /checkout. Each excludes that path and its descendants. Saved crawl history stays available.</p><div className="grid gap-3 sm:grid-cols-3"><label className={styles.label}>Page limit<input type="number" min={1} max={5000} value={limit} onChange={e => setLimit(Number(e.target.value))} className={styles.field}/></label><label className={styles.label}>Maximum depth<input type="number" min={0} max={30} value={depth} onChange={e => setDepth(Number(e.target.value))} className={styles.field}/></label><label className={styles.label}>Delay between pages (ms)<input type="number" min={0} max={5000} value={delay} onChange={e => setDelay(Number(e.target.value))} className={styles.field}/></label></div><label className={styles.label}>Excluded paths<textarea rows={4} className={styles.field} value={value} onChange={(e) => setValue(e.target.value)} /></label><Button disabled={action.busy || !state.data?.permissions.settings} onClick={() => void action.action({ action: "crawl_settings", site, crawlPageLimit: limit, crawlMaxDepth: depth, crawlDelayMs: delay, exclusions: value.split("\n").map((v) => v.trim()).filter(Boolean) })}>Save crawl settings</Button>{action.feedback}</div></details>;
}
