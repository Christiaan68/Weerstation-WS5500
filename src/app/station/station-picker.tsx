import { selectStation } from "./actions";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StationPickerOption {
  slug: string;
  displayName: string;
  isDefault: boolean;
}

/** De stationskeuze wordt alleen voor deze browser onthouden. */
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
          Het gekozen station geldt voor Dashboard, Data, Grafieken, Regen, Wind en
          Records en wordt op dit apparaat in deze browser onthouden. Andere bezoekers
          houden hun eigen keuze.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2" aria-label="Beschikbare stations">
          {stations.map((station) => {
            const isActive = station.slug === activeSlug;
            return (
              <li key={station.slug}>
                <form action={selectStation}>
                  <button
                    type="submit"
                    name="station"
                    value={station.slug}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "focus-visible:outline-primary inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {station.displayName}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
