"use client";

import { useEffect, useState } from "react";

import { WindRoseChart } from "@/components/charts/wind-rose-chart";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";
import type { WindRose } from "@/lib/weather/wind";

type RosePeriod = "today" | "7d" | "30d";

const PERIOD_LABELS: Record<RosePeriod, string> = {
  today: "Vandaag",
  "7d": "7 dagen",
  "30d": "30 dagen",
};

interface LoadedRose {
  key: string;
  rose: WindRose;
}

/**
 * Compacte windroos voor het windpaneel op het dashboard — dezelfde roos en
 * dezelfde data (`/api/weather/wind`) als de Wind-pagina, maar zonder de
 * terug/vooruit-navigatie en extra statistiekkaarten: alleen een kleine
 * keuze tussen vandaag, 7 en 30 dagen.
 */
export function DashboardWindRose({ stationSlug }: { stationSlug: string }) {
  const [period, setPeriod] = useState<RosePeriod>("today");
  const [loaded, setLoaded] = useState<LoadedRose | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const key = `${stationSlug}:${period}`;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const url = `/api/weather/wind?period=${period}&station=${encodeURIComponent(stationSlug)}`;
        const response = await fetch(withBasePath(url), { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as { rose: WindRose };
        if (!cancelled) {
          setLoaded({ key: `${stationSlug}:${period}`, rose: json.rose });
          setFailedKey(null);
        }
      } catch {
        if (!cancelled) setFailedKey(`${stationSlug}:${period}`);
      }
    }

    void load();
    const intervalId = setInterval(load, 300_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [stationSlug, period]);

  const rose = loaded?.key === key ? loaded.rose : null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-1" role="group" aria-label="Periode windroos">
        {(Object.keys(PERIOD_LABELS) as RosePeriod[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
            aria-pressed={value === period}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              value === period
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {PERIOD_LABELS[value]}
          </button>
        ))}
      </div>

      {rose ? (
        <WindRoseChart rose={rose} maxWidth={230} />
      ) : (
        <div className="text-muted-foreground flex aspect-square w-full max-w-[230px] items-center justify-center text-xs">
          {failedKey === key ? "Kon windroos niet laden." : "Laden…"}
        </div>
      )}
    </div>
  );
}
