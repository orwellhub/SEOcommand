"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Modal } from "@/components/ui/modal";
import { activeNavigationItem, navigationHref } from "@/lib/nav";
import { TOOLKITS, currentToolkit } from "@/lib/toolkits";
import { cn } from "@/lib/cn";
import { useDomain } from "./domain-context";
import { ScopePicker } from "./scope-picker";

export function MobileNav() {
  const [open, setOpen] = useState(false), [chosen, setChosen] = useState<string | null>(null);
  const { scope, range } = useDomain();
  const pathname = usePathname(), params = useSearchParams();
  const current = currentToolkit(pathname, new URLSearchParams(params));
  const kit = TOOLKITS.find((entry) => entry.id === chosen) ?? current;
  const selected = activeNavigationItem(kit.groups.flatMap((group) => group.items), pathname, new URLSearchParams(params));
  const close = () => { setOpen(false); setChosen(null); };
  return <div className="lg:hidden"><button onClick={() => setOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-md text-ink hover:bg-workspace" aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
    <Modal open={open} onClose={close} title="Navigation"><div className="absolute inset-0 bg-black/30" onClick={close} aria-hidden="true" />
      <div className="absolute inset-y-0 left-0 flex w-[94%] max-w-md flex-col bg-card text-ink shadow-xl">
        <div className="flex shrink-0 items-center justify-between p-3"><BrandLogo className="w-44" /><button autoFocus onClick={close} aria-label="Close navigation" className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-workspace"><X className="h-5 w-5" /></button></div>
        <div className="px-3 pb-3"><ScopePicker label="Select website in navigation" onNavigate={close} /></div>
        <div className="flex min-h-0 flex-1 border-t border-border"><nav aria-label="Toolkits" className="w-[76px] shrink-0 overflow-y-auto border-r border-border p-1">{TOOLKITS.map((entry) => <button key={entry.id} onClick={() => setChosen(entry.id)} aria-pressed={kit.id === entry.id} className={cn("flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded px-1 py-2 text-center text-[11px] leading-4", kit.id === entry.id ? "bg-rail-selected font-bold text-purple" : "text-muted")}><entry.icon className="h-5 w-5" />{entry.label}</button>)}</nav>
          <nav aria-label={`${kit.label} features`} className="min-w-0 flex-1 overflow-y-auto bg-workspace px-2 pb-6"><h2 className="px-2 py-3 text-base font-bold">{kit.label}</h2>{kit.groups.map((group, index) => <div key={group.label || index} className="mb-3">{group.label && <h3 className="px-2 pb-1 pt-2 text-xs font-bold text-muted">{group.label}</h3>}{group.items.map((entry) => <Link key={entry.href} href={navigationHref(entry, scope, range)} onNavigate={close} aria-current={selected?.href === entry.href ? "page" : undefined} className="flex min-h-11 items-center rounded px-2 py-2 text-[13px] leading-5 text-ink hover:bg-card aria-[current=page]:bg-rail-selected aria-[current=page]:font-bold aria-[current=page]:text-purple">{entry.label}</Link>)}</div>)}</nav>
        </div>
      </div>
    </Modal>
  </div>;
}
