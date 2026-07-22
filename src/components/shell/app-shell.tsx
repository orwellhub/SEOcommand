"use client";

import { PortfolioRail } from "./portfolio-rail";
import { TopNav } from "./top-nav";
import { ContextBar } from "./context-bar";
import { MobileNav } from "./mobile-nav";
import { DemoBanner } from "./demo-banner";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-workspace">
      <PortfolioRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center bg-nav pl-2 lg:pl-0">
          <MobileNav />
          <div className="min-w-0 flex-1">
            <TopNav />
          </div>
        </div>
        <ContextBar />
        <DemoBanner />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
