"use client";

import { Download } from "lucide-react";
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

// Zelfde periode→duur-mapping als `resolveHistoryRange()` in
// `src/lib/weather/history.ts` (server-side, gebruikt door
// `/api/weather/history`) — bewust HIER apart gehouden in plaats van
// geïmporteerd: `history.ts` importeert `getObservationSeries()` uit de
// server-only databaselaag (`queries.ts`), wat niet in een clientbundel
// hoort. Verandert de mapping ooit, dan moet die o.a. hier worden meegenomen.
const PERIOD_TO_MS: Record<Exclude<HistoryPeriod, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  "365d": 365 * 24 * 60 * 60 * 1000,
};
/** Ruim vóór de eerst mogelijke meting van dit project — veilige ondergrens voor period=all (zie ook `EPOCH_FLOOR` in `history.ts`). */
const EPOCH_FLOOR_ISO = "2020-01-01T00:00:00.000Z";

/** Bouwt de CSV-exportlink (§24) voor exact dezelfde periode en metrics als de zichtbare grafiek. */
function buildChartDownloadHref(period: HistoryPeriod, metricKeys: string[]): string {
  const now = new Date();
  const fromIso =
    period === "all" ? EPOCH_FLOOR_ISO : new Date(now.getTime() - PERIOD_TO_MS[period]).toISOString();
  const search = new URLSearchParams({
    preset: "aangepast",
    from: fromIso,
    to: now.toISOString(),
    metrics: metricKeys.join(","),
  });
  return `/api/weather/export/csv?${search.toString()}`;
}

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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Periode">
            {HISTORY_PERIODS.map((p) => (
              <TabButton key={p} active={p === period} onClick={() => setPeriod(p)}>
                {PERIOD_LABELS_NL[p]}
              </TabButton>
            ))}
          </div>
          <a
            href={buildChartDownloadHref(period, metricKeys)}
            className="border-border bg-background text-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors"
            title="Download de gegevens van deze grafiek als CSV, voor dezelfde periode en metrics"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download gegevens
          </a>
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
