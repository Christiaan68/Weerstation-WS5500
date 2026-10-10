"use client";

import { useEffect, useMemo, useState } from "react";

import { CHART_HEIGHT } from "@/components/charts/chart-sizing";
import { RAIN_CHART_METRICS, RainCombinedChart } from "@/components/charts/rain-combined-chart";
import type { TimeSeriesPoint } from "@/components/charts/time-series-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PeriodNavigator } from "@/components/weather/period-navigator";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";
import type { AggregationInterval } from "@/lib/weather/downsampling";
import {
  addDaysToDateKey,
  formatLocalDateLong,
  getLocalDayBoundsUtc,
  todayLocalDateKey,
} from "@/lib/weather/timezone";

interface RainHistoryData {
  points: TimeSeriesPoint[];
  interval: AggregationInterval;
}

interface RainDayChartCardProps {
  stationSlug: string;
  /** Tijdzone van dit station — bepaalt waar de dag begint en eindigt. */
  timeZone?: string;
  /** Aantal dagen terug t.o.v. vandaag (0 = vandaag). Zie `dashboard-charts.tsx`. */
  dayOffset?: number;
  /** Ververs-interval voor de huidige dag; standaard gelijk aan het pollinterval (5 minuten). */
  refreshIntervalMs?: number;
  title?: string;
  description?: string;
}

const NL_NUMBER = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

function maxOf(points: TimeSeriesPoint[], key: string): number | null {
  let max: number | null = null;
  for (const point of points) {
    const value = point.values[key];
    if (typeof value === "number" && Number.isFinite(value) && (max === null || value > max)) {
      max = value;
    }
  }
  return max;
}

/**
 * Kaart met de gecombineerde regengrafiek (cumulatieve regen van de dag +
 * regenintensiteit) voor één lokale kalenderdag — dezelfde dag-opbouw als
 * `HistoryChartCard`, maar met een eigen grafiek omdat twee eenheden hier
 * bewust op één grafiek met twee Y-assen staan.
 */
export function RainDayChartCard({
  stationSlug,
  timeZone,
  dayOffset = 0,
  refreshIntervalMs = 300_000,
  title = "Neerslag",
  description = "Cumulatieve regen van de dag (linkeras) naast de regenintensiteit (rechteras).",
}: RainDayChartCardProps) {
  const [data, setData] = useState<RainHistoryData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const isToday = dayOffset === 0;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const dateKey = addDaysToDateKey(todayLocalDateKey(timeZone), -dayOffset);
        const { startUtc, endUtc } = getLocalDayBoundsUtc(dateKey, timeZone);
        const url = `/api/weather/history?metrics=${encodeURIComponent(RAIN_CHART_METRICS.join(","))}&from=${encodeURIComponent(startUtc.toISOString())}&to=${encodeURIComponent(endUtc.toISOString())}&station=${encodeURIComponent(stationSlug)}`;
        const response = await fetch(withBasePath(url), { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as RainHistoryData;
        if (!cancelled) {
          setData(json);
          setLoadFailed(false);
        }
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    }

    load();
    // Alleen doorlopend verversen voor vandaag — een afgelopen dag verandert niet meer.
    if (!isToday) {
      return () => {
        cancelled = true;
      };
    }
    const intervalId = setInterval(load, refreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [stationSlug, timeZone, refreshIntervalMs, dayOffset, isToday]);

  const totals = useMemo(() => {
    if (!data) return null;
    return {
      dayTotalMm: maxOf(data.points, "rainDayMm"),
      maxRateMmH: maxOf(data.points, "rainRateMmH"),
    };
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data ? (
          <>
            <RainCombinedChart points={data.points} interval={data.interval} />
            {totals && data.points.length > 0 && (
              <p className="text-muted-foreground text-xs">
                Totaal deze dag:{" "}
                <span className="text-foreground font-medium">
                  {totals.dayTotalMm === null ? "–" : `${NL_NUMBER.format(totals.dayTotalMm)} mm`}
                </span>
                {" · "}Hoogste intensiteit:{" "}
                <span className="text-foreground font-medium">
                  {totals.maxRateMmH === null ? "–" : `${NL_NUMBER.format(totals.maxRateMmH)} mm/u`}
                </span>
              </p>
            )}
          </>
        ) : loadFailed ? (
          <p className="text-muted-foreground py-16 text-center text-sm">
            Kon grafiekgegevens niet laden.
          </p>
        ) : (
          <div
            className={cn(
              "text-muted-foreground flex w-full items-center justify-center text-sm",
              CHART_HEIGHT.default,
            )}
          >
            Laden…
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Zelfstandige variant met eigen dagnavigatie (terug/vooruit) — voor de
 * Regen-pagina, waar de kaart niet onder de gedeelde dashboardnavigatie hangt.
 */
export function RainDayChartSection({
  stationSlug,
  timeZone,
}: {
  stationSlug: string;
  timeZone?: string;
}) {
  const [offset, setOffset] = useState(0);

  const rangeLabel = useMemo(() => {
    const dateKey = addDaysToDateKey(todayLocalDateKey(timeZone), -offset);
    return formatLocalDateLong(getLocalDayBoundsUtc(dateKey, timeZone).startUtc, timeZone);
  }, [timeZone, offset]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
          Regenverloop — {rangeLabel}
        </h2>
        <PeriodNavigator
          label={rangeLabel}
          onBack={() => setOffset((o) => o + 1)}
          onForward={() => setOffset((o) => Math.max(0, o - 1))}
          forwardDisabled={offset === 0}
        />
      </div>
      <RainDayChartCard stationSlug={stationSlug} timeZone={timeZone} dayOffset={offset} />
    </div>
  );
}
