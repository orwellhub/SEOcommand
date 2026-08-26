"use client";

import { useMemo, useState } from "react";
import { Check, Folder, FolderPlus, Loader2, Trash2 } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/primitives";
import type { ManagedSite, PortfolioGroup } from "@/platform/types";
import { cn } from "@/lib/cn";

const COLORS = ["#7137F5", "#2563EB", "#0F9F6E", "#D97706", "#DC4C64", "#7C3AED"];
const inputClass = "h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-ink focus:border-purple focus:outline-none";

export function GroupManager({
  sites,
  groups: initialGroups,
  onChanged,
}: {
  sites: ManagedSite[];
  groups: PortfolioGroup[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState(initialGroups);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [color, setColor] = useState(COLORS[0]!);
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id ?? "");
  const [memberships, setMemberships] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordered = useMemo(() => {
    const result: { group: PortfolioGroup; depth: number }[] = [];
    const visit = (parent: string | null, depth: number) => {
      for (const group of groups.filter((item) => item.parentId === parent)) {
        result.push({ group, depth });
        visit(group.id, depth + 1);
      }
    };
    visit(null, 0);
    return result;
  }, [groups]);

  function openManager() {
    setGroups(initialGroups);
    const site = selectedSite || sites[0]?.id || "";
    setSelectedSite(site);
    setMemberships(new Set(initialGroups.filter((group) => group.siteSlugs.includes(site)).map((group) => group.id)));
    setOpen(true);
  }

  function chooseSite(siteSlug: string) {
    setSelectedSite(siteSlug);
    setMemberships(new Set(groups.filter((group) => group.siteSlugs.includes(siteSlug)).map((group) => group.id)));
  }

  async function createGroup() {
    if (name.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/portfolio-groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, parentId: parentId || null, color }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Group could not be created.");
      const created = { ...body.group, siteSlugs: [] } as PortfolioGroup;
      setGroups((current) => [...current, created]);
      setName("");
      setParentId(created.id);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveMemberships() {
    if (!selectedSite) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(selectedSite)}/groups`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupIds: [...memberships] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Memberships could not be saved.");
      setGroups((current) => current.map((group) => ({
        ...group,
        siteSlugs: memberships.has(group.id)
          ? [...new Set([...group.siteSlugs, selectedSite])]
          : group.siteSlugs.filter((slug) => slug !== selectedSite),
      })));
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup(group: PortfolioGroup) {
    if (!window.confirm(`Delete “${group.name}”? Its subgroups will move to the portfolio root.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/portfolio-groups/${group.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Group could not be deleted.");
      setGroups((current) => current.filter((item) => item.id !== group.id).map((item) => item.parentId === group.id ? { ...item, parentId: null } : item));
      setMemberships((current) => { const next = new Set(current); next.delete(group.id); return next; });
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={openManager}><FolderPlus className="h-4 w-4" /> Manage groups</Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Portfolio groups" subtitle="Nest folders and assign websites without changing their reporting setup" width="max-w-2xl">
        <div className="space-y-6">
          <section>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-ink">Create a group or subgroup</h3>
              <p className="mt-1 text-xs text-muted">Choose a parent to create a subgroup. Groups can be nested to any practical depth.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. UAE Finance" aria-label="Group name" />
              <select className={inputClass} value={parentId} onChange={(event) => setParentId(event.target.value)} aria-label="Parent group">
                <option value="">Portfolio root</option>
                {ordered.map(({ group, depth }) => <option key={group.id} value={group.id}>{"— ".repeat(depth)}{group.name}</option>)}
              </select>
              <Button variant="primary" onClick={createGroup} disabled={busy || name.trim().length < 2}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />} Create</Button>
            </div>
            <div className="mt-2 flex gap-1.5" aria-label="Group colour">
              {COLORS.map((value) => <button key={value} type="button" onClick={() => setColor(value)} aria-label={`Use ${value}`} className={cn("h-6 w-6 rounded-full border-2", color === value ? "border-ink" : "border-card")} style={{ background: value }} />)}
            </div>
          </section>

          <section className="rounded-md border border-border">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Group tree</h3>
              <p className="mt-0.5 text-2xs text-muted">{groups.length} groups · deleting a parent preserves its subgroups</p>
            </div>
            {ordered.length ? ordered.map(({ group, depth }) => (
              <div key={group.id} className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5 last:border-0" style={{ paddingLeft: `${12 + depth * 22}px` }}>
                <Folder className="h-4 w-4" style={{ color: group.color, fill: `${group.color}30` }} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-ink">{group.name}</div><div className="text-2xs text-muted">{group.siteSlugs.length} directly assigned</div></div>
                <button onClick={() => deleteGroup(group)} className="rounded p-1.5 text-muted hover:bg-critical/10 hover:text-critical" aria-label={`Delete ${group.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            )) : <div className="px-4 py-8 text-center text-xs text-muted">No groups yet. Create your first folder above.</div>}
          </section>

          <section>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-ink">Assign a website</h3>
              <p className="mt-1 text-xs text-muted">A website can belong to more than one operational group.</p>
            </div>
            <select className={inputClass} value={selectedSite} onChange={(event) => chooseSite(event.target.value)}>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.host}</option>)}
            </select>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {ordered.map(({ group, depth }) => {
                const selected = memberships.has(group.id);
                return <button key={group.id} type="button" onClick={() => setMemberships((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })} className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs", selected ? "border-purple bg-purple/5 text-purple" : "border-border text-muted hover:text-ink")}><span className="flex h-4 w-4 items-center justify-center rounded border" style={{ marginLeft: `${depth * 8}px` }}>{selected && <Check className="h-3 w-3" />}</span><span className="truncate">{group.name}</span></button>;
              })}
            </div>
            <Button className="mt-3" variant="primary" onClick={saveMemberships} disabled={busy || !selectedSite}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save memberships</Button>
          </section>
          {error && <div role="alert" className="rounded-md border border-critical/25 bg-critical/5 p-3 text-xs text-critical">{error}</div>}
        </div>
      </Drawer>
    </>
  );
}
