import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StationPickerOption {
  slug: string;
  displayName: string;
  isDefault: boolean;
}

/**
 * Stationkeuze (tabblad Overzicht van Stations; verplaatst uit de header): de plek waar je kiest welk station
 * op alle pagina's getoond wordt. Alleen zichtbaar bij meer dan één actief
 * station — bij één station voegt een keuze niets toe.
 *
 * De keuze zit, net als voorheen, in de `station`-queryparameter. De
 * navigatie (main-nav.tsx en mobile-nav.tsx) neemt die parameter mee bij het
 * klikken naar een andere pagina. Het default-station krijgt bewust GEEN
 * parameter, zodat de URL identiek blijft aan die van vóór er meerdere
 * stations waren (belangrijk voor gedeelde/gebookmarkte links).
 */
export function StationPicker({
  stations,
  activeSlug,
}: {
  stations: StationPickerOption[];
  activeSlug: string | undefined;
}) {
  if (stations.length <= 1) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Station kiezen</CardTitle>
        <CardDescription>
          Het gekozen station geldt voor Dashboard, Data, Grafieken, Regen, Wind en Records
          zolang je via het menu navigeert.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2" aria-label="Beschikbare stations">
          {stations.map((station) => {
            const isActive = station.slug === activeSlug;
            const href = station.isDefault
              ? "/station"
              : `/station?station=${encodeURIComponent(station.slug)}`;
            return (
              <li key={station.slug}>
                <Link
                  href={href}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "focus-visible:outline-primary inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {station.displayName}
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
