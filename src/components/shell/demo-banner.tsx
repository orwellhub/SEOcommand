"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";
import { IS_DEMO_MODE } from "@/providers";

/** Global, dismissible demo-mode indicator. Becomes hidden once a live provider
 * is connected (IS_DEMO_MODE=false). */
export function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (!IS_DEMO_MODE || dismissed) return null;
  return (
    <div className="flex items-center justify-between gap-2 bg-warning/10 px-4 py-1.5 text-2xs text-[#8A5E10] sm:px-6">
      <div className="flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5" />
        <span>
          <strong className="font-semibold">Demo data.</strong> All figures are realistic seeded
          samples. Connect DataForSEO, Search Console and GA4 in Settings to switch to live data.
        </span>
      </div>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="rounded p-0.5 hover:bg-warning/20">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
