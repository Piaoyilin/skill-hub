"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { logTiming, logTimingEvent } from "@/lib/diagnostics/timing";

type PendingNavigation = {
  from: string;
  to: string;
  startedAt: number;
};

let pendingNavigation: PendingNavigation | null = null;

function currentLocation(pathname: string, search: string) {
  return `${pathname}${search ? `?${search}` : ""}`;
}

export function NavigationTiming() {
  const pathname = usePathname();

  useEffect(() => {
    const location = currentLocation(
      pathname,
      window.location.search.replace(/^\?/, ""),
    );
    if (!pendingNavigation || pendingNavigation.to !== location) return;

    logTiming("NAVIGATION client route", performance.now() - pendingNavigation.startedAt, {
      from: pendingNavigation.from,
      to: pendingNavigation.to,
      status: "settled",
    });
    pendingNavigation = null;
  }, [pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;

      const to = `${url.pathname}${url.search}`;
      const from = `${window.location.pathname}${window.location.search}`;
      if (to === from) return;

      pendingNavigation = {
        from,
        to,
        startedAt: performance.now(),
      };
      logTimingEvent("NAVIGATION start", {
        from,
        to,
        kind: "same-origin-link",
      });
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
