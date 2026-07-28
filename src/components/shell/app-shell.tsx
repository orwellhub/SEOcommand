"use client";

import { PortfolioRail } from "./portfolio-rail";
import { TopNav } from "./top-nav";
import { ContextBar } from "./context-bar";
import { MobileNav } from "./mobile-nav";

/**
 * Application chrome.
 *
 * Height uses 100dvh (dynamic viewport height) rather than 100vh: iOS Safari
 * measures 100vh against the *expanded* viewport, so on iPad the bottom of the
 * shell sat under the browser chrome and the header scrolled out of reach. With
 * dvh the shell always matches the visible area, and the header is pinned in a
 * shrink-0 row so only the module content scrolls.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-workspace">
      <PortfolioRail />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Pinned chrome — never scrolls away, on any device. */}
        <header className="z-30 shrink-0">
          <div className="flex items-center bg-nav pl-2 lg:pl-0">
            <MobileNav />
            <div className="min-w-0 flex-1">
              <TopNav />
            </div>
          </div>
          <ContextBar />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
