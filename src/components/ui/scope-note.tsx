"use client";

/**
 * Banner shown while the scope selector is on "Portfolio". Module pages now
 * render genuinely combined data in that mode, so this states what is being
 * aggregated rather than apologising for a single-domain fallback.
 */
export function ScopeNote({
  isPortfolio,
  noun = "data",
}: {
  isPortfolio: boolean;
  noun?: string;
}) {
  if (!isPortfolio) return null;
  return (
    <p className="-mt-2 text-2xs text-muted">
      Showing <span className="font-medium text-ink">combined {noun}</span> across every property.
      Pick a site in the rail to narrow to one.
    </p>
  );
}
