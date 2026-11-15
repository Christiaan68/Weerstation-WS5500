"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function StorageRefresh({
  children,
  expiresAt,
}: {
  children: ReactNode;
  expiresAt: number;
}) {
  const router = useRouter();
  const [clock, setClock] = useState(0);
  useEffect(() => {
    let lastRefresh = Date.now();
    const tick = () => {
      const now = Date.now();
      setClock(now);
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      // Coalesce online/visibility events and poll only while the page is visible.
      if (now - lastRefresh < 5 * 60_000) return;
      lastRefresh = now;
      router.refresh();
    };
    const timer = setInterval(tick, 30_000);
    const expiryTimer = setTimeout(
      () => setClock(Date.now()),
      Math.max(0, expiresAt - Date.now()),
    );
    window.addEventListener("online", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      clearTimeout(expiryTimer);
      window.removeEventListener("online", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, expiresAt]);
  if (clock >= expiresAt)
    return (
      <p role="status">
        Meting onbekend of onbetrouwbaar: opslagstatus verouderd; waarschuwingen kunnen
        niet worden bepaald. De pagina probeert opnieuw verbinding te maken.
      </p>
    );
  return children;
}
