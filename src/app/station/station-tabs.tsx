import Link from "next/link";

import { cn } from "@/lib/utils";

export type StationTab = "overzicht" | "beheer";

/**
 * Tabbladen van de pagina "Stations": Overzicht (kiezen en bekijken) en Beheer
 * (toevoegen en bewerken). Het hele onderdeel staat onder één menu-item
 * ("Stations", zie src/lib/nav.ts) omdat de twee inhoudelijk bij elkaar horen.
 *
 * `stationParam` is de ruwe `?station=`-waarde van de huidige URL en wordt aan
 * beide tabbladen meegegeven, zodat het gekozen station niet verloren gaat
 * bij het heen en weer klikken tussen de tabbladen.
 */
export function StationTabs({
  active,
  stationParam,
}: {
  active: StationTab;
  stationParam?: string;
}) {
  const query = stationParam ? `?station=${encodeURIComponent(stationParam)}` : "";

  const tabs: { id: StationTab; label: string; href: string }[] = [
    { id: "overzicht", label: "Overzicht", href: `/station${query}` },
    { id: "beheer", label: "Beheer", href: `/station/beheer${query}` },
  ];

  return (
    <nav aria-label="Onderdelen van Stations" className="border-border border-b">
      <ul className="-mb-px flex gap-1">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "focus-visible:outline-primary inline-flex min-h-11 items-center border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
                  isActive
                    ? "border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
