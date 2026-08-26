import { Suspense } from "react";
import { DomainProvider } from "@/components/shell/domain-context";
import { AppShell } from "@/components/shell/app-shell";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-workspace text-sm text-muted">Loading SEO Command Centre…</div>}>
      <DomainProvider>
        <AppShell>{children}</AppShell>
      </DomainProvider>
    </Suspense>
  );
}
