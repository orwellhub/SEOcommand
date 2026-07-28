"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { isDomainId } from "@/data/domains";
import { useDomain } from "@/components/shell/domain-context";
import { EmptyState } from "@/components/ui/primitives";
import DomainOverview from "../page";

/**
 * Per-property landing page — a real, shareable URL for each website
 * (/domain/<id>). Selecting a site in the rail lands here; the page pins the
 * scope to that property and renders the full domain overview, from which each
 * section links through to the module that owns it.
 */
export default function DomainLandingPage() {
  const params = useParams<{ domainId: string }>();
  const domainId = String(params?.domainId ?? "");
  const { scope, setScope } = useDomain();
  const valid = isDomainId(domainId);

  // Deep links must drive the scope, not the other way round.
  useEffect(() => {
    if (valid && scope !== domainId) setScope(domainId);
  }, [valid, domainId, scope, setScope]);

  if (!valid) {
    return (
      <EmptyState
        title="Unknown property"
        description={`No property is configured with the id "${domainId}". Pick a site from the rail to continue.`}
      />
    );
  }

  return <DomainOverview />;
}
