"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { activeNavigationItem, navigationHref } from "@/lib/nav";
import { TOOLKITS, currentToolkit } from "@/lib/toolkits";
import { cn } from "@/lib/cn";
import { useDomain } from "./domain-context";

export function CommandRail() {
  const [pinned, setPinned] = useState(true), [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false), [hash, setHash] = useState("");
  const pathname = usePathname(), params = useSearchParams();
  const { scope, range } = useDomain();
  const kit = currentToolkit(pathname, new URLSearchParams(params));
  const selected = activeNavigationItem(kit.groups.flatMap((group) => group.items), pathname, new URLSearchParams(params), hash);
  const expanded = pinned || hovered || focused;
  useEffect(() => { try { setPinned(window.localStorage.getItem("orwell.sidebar-pinned") !== "false"); } catch { /* Default to readable labels. */ } }, []);
  useEffect(() => { const sync = () => setHash(window.location.hash); sync(); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync); }, [pathname, params]);
  function togglePinned() { setPinned(!pinned); setHovered(false); setFocused(false); try { window.localStorage.setItem("orwell.sidebar-pinned", String(!pinned)); } catch { /* The current preference still applies. */ } }
  const finish = () => { setHovered(false); setFocused(false); };
  return <div className={cn("relative z-40 hidden shrink-0 transition-[width] duration-200 motion-reduce:transition-none lg:block", pinned ? "w-[316px]" : "w-[76px]")}>
    <aside aria-label="Toolkits" className="absolute inset-y-0 left-0 z-10 flex w-[76px] flex-col border-r border-border bg-card">
      <Link href="/portfolio?scope=portfolio" aria-label="SEO Command home" className="flex h-[52px] shrink-0 items-center justify-center"><BrandLogo variant="mark" className="w-11" /></Link>
      <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">{TOOLKITS.map((entry) => <Link key={entry.id} href={navigationHref({ href: entry.href, group: "site" }, scope, range)} aria-current={kit.id === entry.id ? "true" : undefined} className={cn("mb-1 flex min-h-[62px] flex-col items-center justify-center gap-1.5 rounded-md px-1 py-2 text-center text-[11px] font-semibold leading-[14px] transition-colors", kit.id === entry.id ? "bg-rail-selected text-purple" : "text-muted hover:bg-workspace hover:text-ink")}><entry.icon className="h-5 w-5" strokeWidth={1.7} /><span>{entry.label}</span></Link>)}</nav>
      <Link href="/settings" title="Settings" aria-label="Settings" className="flex h-11 shrink-0 items-center justify-center border-t border-border text-muted hover:text-purple"><Settings className="h-4 w-4" /></Link>
      <button onClick={togglePinned} aria-label={pinned ? "Collapse menu" : "Keep menu open"} aria-controls="command-navigation" aria-expanded={expanded} className="flex h-11 shrink-0 items-center justify-center border-t border-border text-muted hover:bg-workspace">{pinned ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}</button>
    </aside>
    <div className={cn("absolute inset-y-0 left-[76px]", expanded ? "w-[240px]" : "w-2")} onPointerEnter={(event) => { if (event.pointerType !== "touch") setHovered(true); }} onPointerLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      {expanded && <aside aria-label={`${kit.label} tools`} className={cn("flex h-full flex-col border-r border-border bg-workspace", !pinned && "shadow-pop")}>
        <div className="flex h-11 shrink-0 items-center px-[18px]"><span className="text-sm font-bold">{kit.id === "ai" ? "AI Visibility" : kit.label}</span></div>
        <nav id="command-navigation" aria-label={`${kit.label} features`} className="min-h-0 flex-1 overflow-y-auto px-2 pb-5 pt-2">{kit.groups.map((group, index) => <div key={group.label || index} className="mb-4">{group.label && <h2 className="px-2 pb-1 pt-2 text-xs font-medium text-muted">{group.label}</h2>}{group.items.map((entry) => <Link key={entry.href} href={navigationHref(entry, scope, range)} onNavigate={finish} aria-current={selected?.href === entry.href ? "page" : undefined} className={cn("flex min-h-7 items-center rounded px-3 py-1 text-sm leading-5", selected?.href === entry.href ? "bg-rail-selected font-bold text-purple" : "text-ink hover:bg-card hover:text-purple")}>{entry.label}</Link>)}</div>)}</nav>
      </aside>}
    </div>
  </div>;
}
