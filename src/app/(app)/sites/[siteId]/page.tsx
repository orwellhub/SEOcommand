"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useDomain } from "@/components/shell/domain-context";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import DomainOverview from "../../domain/page";

export default function SiteWorkspaceOverviewPage() {
  const params = useParams<{ siteId: string }>();
  const siteId = String(params?.siteId ?? "");
  const { scope, setScope, sites, sitesLoading } = useDomain();
  const valid = sites.some((site) => site.id === siteId);

  useEffect(() => {
    if (valid && scope !== siteId) setScope(siteId);
  }, [scope, setScope, siteId, valid]);

  if (sitesLoading) return <Skeleton className="h-96" />;
  if (!valid) return <EmptyState title="Website not found" description="This website is not available to your account or has been archived." />;
  return <DomainOverview />;
}
