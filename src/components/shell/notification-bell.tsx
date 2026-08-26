"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    fetch("/api/notifications?limit=1")
      .then((response) => response.ok ? response.json() : null)
      .then((body) => setUnread(body?.unread ?? 0))
      .catch(() => undefined);
  }, []);
  return <Link href="/notifications" className="relative rounded-md p-1.5 text-white/60 transition-colors hover:bg-rail-selected hover:text-white" aria-label={`${unread} unread notifications`}>
    <Bell className="h-4 w-4" />
    {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-critical px-1 text-center text-[9px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
  </Link>;
}
