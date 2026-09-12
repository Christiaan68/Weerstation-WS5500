"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Horizontale desktopnavigatie. Verborgen op smalle schermen (zie MobileNav). */
export function MainNav() {
  const pathname = usePathname();
  // Fase 5.2: de gekozen `?station=` moet meereizen bij het klikken door de
  // navigatie — anders springt elke paginawissel stilzwijgend terug naar het
  // default-station (zie station-switcher.tsx).
  const currentStation = useSearchParams().get("station");

  return (
    <nav className="hidden items-center gap-1 lg:flex" aria-label="Hoofdnavigatie">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const href = currentStation
          ? `${item.href}?station=${encodeURIComponent(currentStation)}`
          : item.href;
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive && "bg-accent text-accent-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
