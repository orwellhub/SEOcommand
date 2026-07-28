"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * "Open in <module>" affordance used on the domain landing page. Every section
 * of the hub is a summary of a module, so each one links through to the place
 * that owns the full detail.
 */
export function ModuleLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium text-muted transition-colors hover:bg-workspace hover:text-[color:var(--accent)]",
        className,
      )}
    >
      {label}
      <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}
