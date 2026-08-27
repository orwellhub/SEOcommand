"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Folder, Globe2, Layers3 } from "lucide-react";
import type { Domain } from "@/lib/types";
import type { PortfolioGroup } from "@/platform/types";
import { useDomain } from "@/components/shell/domain-context";
import { cn } from "@/lib/cn";
import { siteConstellationPosition } from "./portfolio-layout";

interface Headline {
  domainId: string;
  health: number | null;
  clicks28d: number | null;
  criticalIssues: number | null;
}

interface Node {
  id: string;
  kind: "root" | "group" | "site";
  label: string;
  subtitle: string;
  color: string;
  x: number;
  y: number;
  parent: string | null;
  health?: number | null;
  issues?: number | null;
}

export function PortfolioConstellation({ sites, groups, headlines }: { sites: Domain[]; groups: PortfolioGroup[]; headlines: Headline[] }) {
  const { scope, setScope } = useDomain();
  const router = useRouter();
  const nodes = useMemo<Node[]>(() => {
    const visibleGroups = groups.slice(0, 7);
    const root: Node = { id: "portfolio", kind: "root", label: "Portfolio", subtitle: `${sites.length} websites`, color: "#335CFF", x: 10, y: 50, parent: null };
    const groupNodes = visibleGroups.map((group, index) => ({
      id: group.id,
      kind: "group" as const,
      label: group.name,
      subtitle: `${group.siteSlugs.length} direct`,
      color: group.color,
      x: 36,
      y: visibleGroups.length === 1 ? 50 : 13 + index * (74 / Math.max(visibleGroups.length - 1, 1)),
      parent: group.parentId && visibleGroups.some((item) => item.id === group.parentId) ? group.parentId : "portfolio",
    }));
    const siteNodes = sites.slice(0, 20).map((site, index) => {
      const group = visibleGroups.find((item) => item.siteSlugs.includes(site.id));
      const headline = headlines.find((item) => item.domainId === site.id);
      const position = siteConstellationPosition(index);
      return {
        id: site.id,
        kind: "site" as const,
        label: site.name,
        subtitle: headline?.health == null ? "Awaiting sync" : `Health ${headline.health}`,
        color: headline?.criticalIssues ? "#FF5C62" : headline?.health != null && headline.health < 75 ? "#F2B544" : site.accent || "#16A879",
        ...position,
        parent: group?.id ?? "portfolio",
        health: headline?.health,
        issues: headline?.criticalIssues,
      };
    });
    return [root, ...groupNodes, ...siteNodes];
  }, [groups, headlines, sites]);
  const byId = new Map(nodes.map((node) => [node.id, node]));

  function choose(node: Node) {
    if (node.kind === "root") {
      setScope("portfolio");
      router.push("/portfolio");
    } else if (node.kind === "group") {
      setScope(`group:${node.id}`);
      router.push("/portfolio");
    } else {
      setScope(node.id);
      router.push(`/sites/${node.id}`);
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <div className="signal-grid relative h-[430px] min-w-[1080px] overflow-hidden">
        <div className="absolute left-5 top-5 z-10 max-w-sm">
          <div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-purple" /><h2 className="text-sm font-extrabold text-ink">Portfolio constellation</h2></div>
          <p className="mt-1 text-2xs text-muted">Select a group or website to focus every tool. Node colour reflects current health.</p>
        </div>
        <div className="absolute right-5 top-5 z-10 flex items-center gap-3 rounded-md border border-border bg-card/90 px-3 py-2 text-[10px] font-semibold text-muted shadow-sm">
          <Legend color="#16A879" label="Healthy" /><Legend color="#F2B544" label="Watch" /><Legend color="#FF5C62" label="Critical" />
        </div>
        <svg className="absolute inset-0 h-full w-full" aria-hidden>
          {nodes.filter((node) => node.parent).map((node) => {
            const parent = byId.get(node.parent!);
            return parent ? <line key={node.id} x1={`${parent.x}%`} y1={`${parent.y}%`} x2={`${node.x}%`} y2={`${node.y}%`} stroke="rgb(var(--border))" strokeWidth="1.5" strokeDasharray={node.kind === "site" ? "3 5" : undefined} /> : null;
          })}
        </svg>
        {nodes.map((node) => {
          const active = scope === node.id || scope === `group:${node.id}` || (scope === "portfolio" && node.kind === "root");
          return <button
            key={node.id}
            onClick={() => choose(node)}
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
            className={cn("absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card text-left shadow-card transition hover:z-20 hover:-translate-y-[54%] hover:shadow-pop", node.kind === "site" ? "w-32 p-2.5" : "w-36 p-3", active ? "border-purple ring-2 ring-purple/15" : "border-border")}
            aria-label={`Open ${node.label}`}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: `${node.color}18`, color: node.color }}>{node.kind === "root" ? <Layers3 className="h-4 w-4" /> : node.kind === "group" ? <Folder className="h-4 w-4" /> : <Globe2 className="h-4 w-4" />}</span>
              <span className="min-w-0"><span className="block truncate text-xs font-bold text-ink">{node.label}</span><span className="block truncate text-[10px] text-muted">{node.subtitle}</span></span>
            </div>
            {node.kind === "site" && <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-workspace"><span className="block h-full rounded-full" style={{ width: `${Math.max(4, node.health ?? 4)}%`, background: node.color }} /></span>}
          </button>;
        })}
        {sites.length > 20 && <div className="absolute bottom-4 right-5 rounded-md border border-border bg-card px-3 py-2 text-2xs font-semibold text-muted">+{sites.length - 20} more in table view</div>}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</span>;
}
