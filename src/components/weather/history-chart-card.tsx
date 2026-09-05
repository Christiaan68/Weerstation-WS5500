"use client";

import { useEffect, useState } from "react";

import {
  TimeSeriesChart,
  type TimeSeriesPoint,
  type TimeSeriesSeriesDef,
} from "@/components/charts/time-series-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AggregationInterval } from "@/lib/weather/downsampling";

interface HistoryChartData {
  points: TimeSeriesPoint[];
  // De API (`/api/weather/history`) noemt dit veld `metrics`, niet `series`
  // — zie `HistoryResponseBody` in `src/lib/weather/history.ts`.
  metrics: TimeSeriesSeriesDef[];
  interval: AggregationInterval;
}

interface HistoryChartCardProps {
  stationSlug: string;
  metrics: string[];
  period?: string;
  title: string;
  description?: string;
  /** Ververs-interval; standaard gelijk aan het huidige pollinterval (5 minuten). */
  refreshIntervalMs?: number;
}

/**
 * Kaart met een tijdreeksgrafiek uit `/api/weather/history` — gebruikt op
 * het dashboard (24-uursgrafiek) en `/grafieken`. Client-side, ververst
 * periodiek net als `LiveWeatherDashboard`.
 */
export function HistoryChartCard({
  stationSlug,
  metrics,
  period = "24h",
  title,
  description,
  refreshIntervalMs = 300_000,
}: HistoryChartCardProps) {
  const metricsKey = metrics.join(",");
  const [data, setData] = useState<HistoryChartData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const url = `/api/weather/history?metrics=${encodeURIComponent(metricsKey)}&period=${encodeURIComponent(period)}&stationSlug=${encodeURIComponent(stationSlug)}`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as HistoryChartData;
        if (!cancelled) {
          setData(json);
          setLoadFailed(false);
        }
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    }

    load();
    const intervalId = setInterval(load, refreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [stationSlug, metricsKey, period, refreshIntervalMs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {data ? (
          <TimeSeriesChart
            points={data.points}
            series={data.metrics}
            interval={data.interval}
          />
        ) : loadFailed ? (
          <p className="text-muted-foreground py-16 text-center text-sm">
            Kon grafiekgegevens niet laden.
          </p>
        ) : (
          <div className="text-muted-foreground flex h-[320px] items-center justify-center text-sm">
            Laden…
          </div>
        )}
      </CardContent>
    </Card>
  );
}
