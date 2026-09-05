"use client";

import { useEffect, useMemo, useState } from "react";

import {
  TimeSeriesChart,
  type TimeSeriesPoint,
  type TimeSeriesSeriesDef,
} from "@/components/charts/time-series-chart";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AggregationInterval } from "@/lib/weather/downsampling";
import {
  HISTORY_CATEGORIES,
  HISTORY_CATEGORY_LABELS_NL,
  HISTORY_PERIODS,
  metricsForCategory,
  type HistoryCategory,
  type HistoryPeriod,
} from "@/lib/weather/history-metrics-catalog";

const PERIOD_LABELS_NL: Record<HistoryPeriod, string> = {
  "24h": "24 uur",
  "7d": "7 dagen",
  "30d": "30 dagen",
  "90d": "90 dagen",
  "365d": "1 jaar",
  all: "Alles",
};

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

interface HistoryApiResponse {
  interval: AggregationInterval;
  points: TimeSeriesPoint[];
  metrics: TimeSeriesSeriesDef[];
}

export function ChartsExplorer({ stationSlug }: { stationSlug: string }) {
  const [category, setCategory] = useState<HistoryCategory>("temperatuur");
  const [period, setPeriod] = useState<HistoryPeriod>("24h");
  const [data, setData] = useState<HistoryApiResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const metricKeys = useMemo(
    () => metricsForCategory(category).map((m) => m.key),
    [category],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (cancelled) return;
      setData(null);
      setLoadFailed(false);
      try {
        const url = `/api/weather/history?metrics=${encodeURIComponent(metricKeys.join(","))}&period=${period}&stationSlug=${encodeURIComponent(stationSlug)}`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = (await response.json()) as HistoryApiResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [stationSlug, metricKeys, period]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Categorie">
          {HISTORY_CATEGORIES.map((c) => (
            <TabButton key={c} active={c === category} onClick={() => setCategory(c)}>
              {HISTORY_CATEGORY_LABELS_NL[c]}
            </TabButton>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Periode">
          {HISTORY_PERIODS.map((p) => (
            <TabButton key={p} active={p === period} onClick={() => setPeriod(p)}>
              {PERIOD_LABELS_NL[p]}
            </TabButton>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          {data ? (
            data.points.length > 0 ? (
              <TimeSeriesChart
                points={data.points}
                series={data.metrics}
                interval={data.interval}
                heightPx={360}
              />
            ) : (
              <p className="text-muted-foreground py-16 text-center text-sm">
                Nog geen metingen beschikbaar voor deze periode.
              </p>
            )
          ) : loadFailed ? (
            <p className="text-muted-foreground py-16 text-center text-sm">
              Kon grafiekgegevens niet laden.
            </p>
          ) : (
            <div className="text-muted-foreground flex h-[360px] items-center justify-center text-sm">
              Laden…
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
