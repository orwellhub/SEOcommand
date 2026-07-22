import { DomainProvider } from "@/components/shell/domain-context";
import { AppShell } from "@/components/shell/app-shell";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <DomainProvider>
      <AppShell>{children}</AppShell>
    </DomainProvider>
  );
}
