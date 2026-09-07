"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface StationOption {
  slug: string;
  displayName: string;
  isDefault: boolean;
}

/**
 * Stationselector (Fase 5.2, §desktop+mobiel) — alleen gerenderd wanneer er
 * meer dan één actief station is (zie header.tsx/mobile-nav.tsx): bij één
 * station voegt een selector niets toe en is hij bewust verborgen, zodat de
 * bestaande, ongewijzigde WS5500-installatie er niets van merkt.
 *
 * Navigeert door de `station`-queryparameter op het HUIDIGE pad te zetten —
 * behoudt zo altijd de huidige pagina (dashboard, wind, records, ...) en
 * eventuele andere queryparameters (bv. `?key=` op de diagnosepagina).
 */
export function StationSwitcher({ stations }: { stations: StationOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (stations.length <= 1) {
    return null;
  }

  const defaultSlug = stations.find((s) => s.isDefault)?.slug ?? stations[0]!.slug;
  const currentSlug = searchParams.get("station") ?? defaultSlug;

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextSlug = event.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (nextSlug === defaultSlug) {
      // Weglaten i.p.v. expliciet instellen op het default-station houdt de
      // URL kort en identiek aan hoe hij eruitzag vóór er meerdere stations
      // waren (belangrijk voor gedeelde/gebookmarkte links).
      params.delete("station");
    } else {
      params.set("station", nextSlug);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">Kies station</span>
      <select
        value={currentSlug}
        onChange={handleChange}
        className="border-border bg-background text-foreground focus-visible:outline-primary max-w-[9rem] truncate rounded-md border px-2 py-1.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 sm:max-w-[12rem] sm:text-sm"
        aria-label="Kies weerstation"
      >
        {stations.map((station) => (
          <option key={station.slug} value={station.slug}>
            {station.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
