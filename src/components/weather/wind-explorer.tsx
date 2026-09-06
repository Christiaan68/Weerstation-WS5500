"use client";

import { Gauge, Wind } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { WindRoseChart } from "@/components/charts/wind-rose-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodNavigator } from "@/components/weather/period-navigator";
import { cn } from "@/lib/utils";
import {
  addDaysToDateKey,
  formatLocalDateLong,
  formatLocalDateRangeShort,
  formatLocalDateTime,
  getLocalDayBoundsUtc,
  todayLocalDateKey,
} from "@/lib/weather/timezone";
import type { WindRose } from "@/lib/weather/wind";

type WindRosePeriod = "today" | "7d" | "30d";

/**
 * Label bij de terug/vooruit-navigatie — client-side berekend met dezelfde
 * vensterformule als `getWindRoseOverview()` (wind-service.ts), zodat het
 * label direct klopt zonder op de fetch te hoeven wachten.
 */
function computeWindRangeLabel(period: WindRosePeriod, offset: number): string {
  if (period === "today") {
    const dateKey = addDaysToDateKey(todayLocalDateKey(), -offset);
    return formatLocalDateLong(getLocalDayBoundsUtc(dateKey).startUtc);
  }
  const windowMs = (period === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;
  const to = new Date(Date.now() - offset * windowMs);
  const from = new Date(to.getTime() - windowMs);
  return formatLocalDateRangeShort(from, to);
}

const PERIOD_LABELS: Record<WindRosePeriod, string> = {
  today: "Vandaag",
  "7d": "7 dagen",
  "30d": "30 dagen",
};

interface WindOverviewResponse {
  period: WindRosePeriod;
  rose: WindRose;
  stats: {
    avgSpeedKmh: number | null;
    maxGustKmh: number | null;
    maxGustAt: string | null;
  };
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

function dominantDirection(rose: WindRose): string | null {
  const sorted = [...rose.sectors]
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
  return sorted[0]?.direction ?? null;
}

export function WindExplorer({ stationSlug }: { stationSlug: string }) {
  const [period, setPeriod] = useState<WindRosePeriod>("today");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<WindOverviewResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (cancelled) return;
      setData(null);
      setLoadFailed(false);
      try {
        const url = `/api/weather/wind?period=${period}&offset=${offset}&stationSlug=${encodeURIComponent(stationSlug)}`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as WindOverviewResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    }

    load();
    const intervalId = setInterval(load, 300_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [stationSlug, period, offset]);

  const rangeLabel = useMemo(() => computeWindRangeLabel(period, offset), [period, offset]);

  function selectPeriod(p: WindRosePeriod) {
    setPeriod(p);
    setOffset(0);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Periode">
          {(Object.keys(PERIOD_LABELS) as WindRosePeriod[]).map((p) => (
            <TabButton key={p} active={p === period} onClick={() => selectPeriod(p)}>
              {PERIOD_LABELS[p]}
            </TabButton>
          ))}
        </div>

        <PeriodNavigator
          label={rangeLabel}
          onBack={() => setOffset((o) => o + 1)}
          onForward={() => setOffset((o) => Math.max(0, o - 1))}
          forwardDisabled={offset === 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Windroos — {PERIOD_LABELS[period].toLowerCase()}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {data ? (
              <WindRoseChart rose={data.rose} />
            ) : (
              <div className="text-muted-foreground flex h-[280px] items-center justify-center text-sm">
                {loadFailed ? "Kon gegevens niet laden." : "Laden…"}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle>Gemiddelde windsnelheid</CardTitle>
              <Wind className="text-muted-foreground h-4 w-4" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              {data && data.stats.avgSpeedKmh !== null ? (
                <p className="text-foreground text-2xl font-semibold tracking-tight">
                  {data.stats.avgSpeedKmh}
                  <span className="text-muted-foreground ml-1 text-base font-normal">
                    km/h
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {data
                    ? "Nog geen gegevens ontvangen"
                    : loadFailed
                      ? "Kon niet laden"
                      : "Laden…"}
                </p>
              )}
              {data && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Overheersende richting: {dominantDirection(data.rose) ?? "–"}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle>Hoogste windstoot</CardTitle>
              <Gauge className="text-muted-foreground h-4 w-4" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              {data && data.stats.maxGustKmh !== null ? (
                <>
                  <p className="text-foreground text-2xl font-semibold tracking-tight">
                    {data.stats.maxGustKmh}
                    <span className="text-muted-foreground ml-1 text-base font-normal">
                      km/h
                    </span>
                  </p>
                  {data.stats.maxGustAt && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {formatLocalDateTime(new Date(data.stats.maxGustAt))}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {data
                    ? "Nog geen gegevens ontvangen"
                    : loadFailed
                      ? "Kon niet laden"
                      : "Laden…"}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
