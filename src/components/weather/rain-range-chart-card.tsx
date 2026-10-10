"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CHART_HEIGHT, type ChartHeightVariant } from "@/components/charts/chart-sizing";
import {
  cumulativeRainFromPoints,
  RAIN_CHART_METRICS,
  RainCombinedChart,
} from "@/components/charts/rain-combined-chart";
import type { TimeSeriesPoint } from "@/components/charts/time-series-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";
import type { AggregationInterval } from "@/lib/weather/downsampling";

interface RainHistoryData {
  points: TimeSeriesPoint[];
  interval: AggregationInterval;
}

export interface RainRange {
  from: Date;
  to: Date;
}

interface RainRangeChartCardProps {
  stationSlug: string;
  timeZone?: string;
  /**
   * Geeft het tijdvak op het moment van laden. Een functie i.p.v. vaste
   * waarden, zodat "vandaag" bij elke verversing opnieuw wordt bepaald (rond
   * middernacht schuift de kaart dan vanzelf door naar de nieuwe dag).
   */
  getRange: () => RainRange;
  /** Wijzigt zodra het tijdvak inhoudelijk anders is (dag/periode/offset) — start dan een nieuwe aanvraag. */
  rangeKey: string;
  /** Doorlopend verversen (alleen zinvol voor het lopende tijdvak). */
  autoRefresh: boolean;
  refreshIntervalMs?: number;
  title: string;
  description?: string;
  size?: ChartHeightVariant;
  /** Toont onder de grafiek "<label>: x mm · Hoogste intensiteit: y mm/u" — weglaten als die cijfers elders staan. */
  summaryLabel?: string;
}

const NL_NUMBER = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

function maxOf(values: Array<number | null | undefined>): number | null {
  let max: number | null = null;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && (max === null || value > max)) {
      max = value;
    }
  }
  return max;
}

/**
 * Kaart met de gecombineerde regengrafiek (cumulatieve regen + regenintensiteit,
 * twee Y-assen) voor een willekeurig tijdvak uit `/api/weather/history` —
 * gebruikt door het dashboard (één dag) en de Regen-pagina (dag/week/maand/jaar).
 */
export function RainRangeChartCard({
  stationSlug,
  timeZone,
  getRange,
  rangeKey,
  autoRefresh,
  refreshIntervalMs = 300_000,
  title,
  description,
  size = "default",
  summaryLabel,
}: RainRangeChartCardProps) {
  const [loaded, setLoaded] = useState<{ key: string; data: RainHistoryData } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  // Altijd de nieuwste `getRange` gebruiken zonder de aanvraag-effect opnieuw te starten.
  const getRangeRef = useRef(getRange);
  useEffect(() => {
    getRangeRef.current = getRange;
  }, [getRange]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { from, to } = getRangeRef.current();
        const url = `/api/weather/history?metrics=${encodeURIComponent(RAIN_CHART_METRICS.join(","))}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&station=${encodeURIComponent(stationSlug)}`;
        const response = await fetch(withBasePath(url), { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as RainHistoryData;
        if (!cancelled) {
          setLoaded({ key: rangeKey, data: json });
          setFailedKey(null);
        }
      } catch {
        if (!cancelled) setFailedKey(rangeKey);
      }
    }

    load();
    if (!autoRefresh) {
      return () => {
        cancelled = true;
      };
    }
    const intervalId = setInterval(load, refreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [stationSlug, rangeKey, autoRefresh, refreshIntervalMs]);

  // Toon alleen data die bij het huidige tijdvak hoort (geen oude periode laten staan).
  const data = loaded && loaded.key === rangeKey ? loaded.data : null;
  const loadFailed = !data && failedKey === rangeKey;

  const summary = useMemo(() => {
    if (!data || data.points.length === 0) return null;
    const cumulative = cumulativeRainFromPoints(data.points, timeZone);
    return {
      totalMm: maxOf(cumulative),
      maxRateMmH: maxOf(data.points.map((p) => p.values["rainRateMmH"])),
    };
  }, [data, timeZone]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data ? (
          <>
            <RainCombinedChart
              points={data.points}
              interval={data.interval}
              size={size}
              timeZone={timeZone}
            />
            {summaryLabel && summary && (
              <p className="text-muted-foreground text-xs">
                {summaryLabel}:{" "}
                <span className="text-foreground font-medium">
                  {summary.totalMm === null ? "–" : `${NL_NUMBER.format(summary.totalMm)} mm`}
                </span>
                {" · "}Hoogste intensiteit:{" "}
                <span className="text-foreground font-medium">
                  {summary.maxRateMmH === null
                    ? "–"
                    : `${NL_NUMBER.format(summary.maxRateMmH)} mm/u`}
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
              CHART_HEIGHT[size],
            )}
          >
            Laden…
          </div>
        )}
      </CardContent>
    </Card>
  );
}
