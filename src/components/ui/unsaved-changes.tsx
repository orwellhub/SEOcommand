"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./modal";
import { Button } from "./primitives";

let activeGuard: ((action: () => void) => void) | null = null;
export function navigateSafely(action: () => void) { if (activeGuard) activeGuard(action); else action(); }

export function UnsavedChanges({ dirty, saving, onDiscard, onSave, title = "Unsaved website settings", description = "You have unsaved settings for this website. Save them before continuing, or discard this draft." }: { dirty: boolean; saving: boolean; onDiscard: () => void; onSave?: () => void; title?: string; description?: string }) {
  const router = useRouter();
  const pending = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false); const [awaitingSave, setAwaitingSave] = useState(false);
  function proceed() { const action = pending.current; pending.current = null; setOpen(false); setAwaitingSave(false); action?.(); }
  useEffect(() => {
    if (awaitingSave && !dirty && !saving) proceed();
  }, [awaitingSave, dirty, saving]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (action: () => void) => { pending.current = action; setAwaitingSave(false); setOpen(true); };
    activeGuard = guard;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.href === window.location.href) return;
      event.preventDefault(); event.stopPropagation(); guard(() => router.push(`${url.pathname}${url.search}${url.hash}`));
    };
    const origin = window.location.href;
    const originState = window.history.state;
    const pop = (event: PopStateEvent) => {
      const destination = window.location.href;
      if (destination === origin) return;
      event.stopImmediatePropagation();
      window.history.pushState(originState, "", origin);
      guard(() => router.push(destination));
    };
    window.addEventListener("popstate", pop, true);
    window.addEventListener("beforeunload", unload); document.addEventListener("click", click, true);
    return () => { if (activeGuard === guard) activeGuard = null; window.removeEventListener("popstate", pop, true); window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [dirty, router]);
  return <Modal open={open} onClose={() => { setOpen(false); pending.current = null; setAwaitingSave(false); }} title={title}><div className="absolute inset-0 bg-black/30" /><div className="absolute left-4 right-4 top-1/4 mx-auto max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"><h2 className="text-lg font-bold">Save your changes?</h2><p className="mt-3 text-sm text-muted">{description}</p><div className="mt-5 flex flex-wrap gap-2">{onSave&&<Button disabled={saving} onClick={() => { setAwaitingSave(true); onSave(); }}>Save and continue</Button>}<Button disabled={saving} onClick={() => { onDiscard(); proceed(); }}>Discard changes</Button><Button disabled={saving} onClick={() => { pending.current = null; setOpen(false); setAwaitingSave(false); }}>Stay here</Button></div>{awaitingSave && !saving && dirty && <p className="mt-3 text-sm text-muted">Complete any validation errors in the form before continuing.</p>}</div></Modal>;
}
