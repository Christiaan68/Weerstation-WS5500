"use client";

import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CHART_HEIGHT } from "@/components/charts/chart-sizing";
import {
  TimeSeriesChart,
  type TimeSeriesPoint,
  type TimeSeriesSeriesDef,
} from "@/components/charts/time-series-chart";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodNavigator } from "@/components/weather/period-navigator";
import { cn } from "@/lib/utils";
import type { AggregationInterval } from "@/lib/weather/downsampling";
import {
  HISTORY_CATEGORIES,
  HISTORY_CATEGORY_LABELS_NL,
  metricsForCategory,
  type HistoryCategory,
} from "@/lib/weather/history-metrics-catalog";
import {
  formatLocalDateLong,
  formatLocalDateRangeShort,
  getLocalDayBoundsUtc,
  todayLocalDateKey,
} from "@/lib/weather/timezone";

/**
 * Periode-tabbladen van de Grafieken-pagina. Bewust een EIGEN, lokale type
 * i.p.v. het gedeelde `HistoryPeriod`/`HISTORY_PERIODS` uit
 * `history-metrics-catalog.ts`: "24 uur" (rollend venster) is hier vervangen
 * door "1 dag" (lokale kalenderdag, 00:00–24:00 Europe/Amsterdam), terwijl
 * het dashboard ("Laatste 24 uur"-kaart, `history-chart-card.tsx` +
 * `dashboard/page.tsx`) het rollende `period=24h` ongewijzigd blijft
 * gebruiken. We sturen daarom voor ELK tabblad hier altijd expliciete
 * `from`/`to` naar `/api/weather/history` i.p.v. een `period`-preset:
 * `resolveHistoryRange()` (history.ts) geeft expliciete from/to voorrang
 * boven period, dus dit werkt zonder enige wijziging aan de API of aan de
 * gedeelde periode-types.
 */
const CHART_PERIODS = ["1d", "7d", "30d", "90d", "365d", "all"] as const;
type ChartPeriod = (typeof CHART_PERIODS)[number];

const CHART_PERIOD_LABELS_NL: Record<ChartPeriod, string> = {
  "1d": "1 dag",
  "7d": "7 dagen",
  "30d": "30 dagen",
  "90d": "90 dagen",
  "365d": "1 jaar",
  all: "Alles",
};

const CHART_PERIOD_TO_MS: Record<Exclude<ChartPeriod, "1d" | "all">, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  "365d": 365 * 24 * 60 * 60 * 1000,
};

/** Ruim vóór de eerst mogelijke meting van dit project — veilige ondergrens voor period=all (zie ook `EPOCH_FLOOR` in `history.ts`). */
const EPOCH_FLOOR_ISO = "2020-01-01T00:00:00.000Z";

/** Verschuift een "YYYY-MM-DD"-datumsleutel met een aantal dagen — pure kalenderwiskunde, geen tijdzone nodig. */
function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

interface ChartRange {
  from: Date;
  to: Date;
}

/**
 * Bepaalt het exacte UTC-tijdvak voor het huidige tabblad + eventuele
 * terug/vooruit-navigatie. `offset` = aantal vensters terug vanaf nu/vandaag
 * (0 = huidige/meest recente venster). Voor "1 dag" is dat een lokale
 * kalenderdag (DST-bewust via `getLocalDayBoundsUtc`); voor de overige
 * periodes een rollend venster van precies de eigen lengte, net als
 * voorheen bij offset 0.
 */
function computeChartRange(period: ChartPeriod, offset: number, now: Date): ChartRange {
  if (period === "all") {
    return { from: new Date(EPOCH_FLOOR_ISO), to: now };
  }
  if (period === "1d") {
    const dateKey = shiftDateKey(todayLocalDateKey(), -offset);
    const { startUtc, endUtc } = getLocalDayBoundsUtc(dateKey);
    return { from: startUtc, to: endUtc };
  }
  const periodMs = CHART_PERIOD_TO_MS[period];
  const to = new Date(now.getTime() - offset * periodMs);
  const from = new Date(to.getTime() - periodMs);
  return { from, to };
}

/** Compact label bij de navigatieknoppen, bv. "5 september 2026" of "za 30 aug – vr 5 sep". */
function formatChartRangeLabel(period: ChartPeriod, range: ChartRange): string {
  if (period === "all") return "Volledige geschiedenis";
  if (period === "1d") return formatLocalDateLong(range.from);
  return formatLocalDateRangeShort(range.from, range.to);
}

/** Bouwt de CSV-exportlink (§24) voor exact dezelfde periode en metrics als de zichtbare grafiek. */
function buildChartDownloadHref(
  range: ChartRange,
  metricKeys: string[],
  stationSlug: string,
): string {
  const search = new URLSearchParams({
    // Fase 5: expliciet het geselecteerde station meesturen, anders
    // exporteert deze link altijd het standaardstation.
    station: stationSlug,
    preset: "aangepast",
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    metrics: metricKeys.join(","),
  });
  return `/api/weather/export/csv?${search.toString()}`;
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

interface HistoryApiResponse {
  interval: AggregationInterval;
  points: TimeSeriesPoint[];
  metrics: TimeSeriesSeriesDef[];
}

export function ChartsExplorer({ stationSlug }: { stationSlug: string }) {
  const [category, setCategory] = useState<HistoryCategory>("temperatuur");
  const [period, setPeriod] = useState<ChartPeriod>("1d");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<HistoryApiResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const metricKeys = useMemo(
    () => metricsForCategory(category).map((m) => m.key),
    [category],
  );

  const range = useMemo(() => computeChartRange(period, offset, new Date()), [period, offset]);
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (cancelled) return;
      setData(null);
      setLoadFailed(false);
      try {
        const url = `/api/weather/history?metrics=${encodeURIComponent(metricKeys.join(","))}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&station=${encodeURIComponent(stationSlug)}`;
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
  }, [stationSlug, metricKeys, fromIso, toIso]);

  function selectPeriod(p: ChartPeriod) {
    setPeriod(p);
    setOffset(0);
  }

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
            {CHART_PERIODS.map((p) => (
              <TabButton key={p} active={p === period} onClick={() => selectPeriod(p)}>
                {CHART_PERIOD_LABELS_NL[p]}
              </TabButton>
            ))}
          </div>

          {period !== "all" && (
            <PeriodNavigator
              label={formatChartRangeLabel(period, range)}
              onBack={() => setOffset((o) => o + 1)}
              onForward={() => setOffset((o) => Math.max(0, o - 1))}
              forwardDisabled={offset === 0}
            />
          )}

          <a
            href={buildChartDownloadHref(range, metricKeys, stationSlug)}
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
                size="large"
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
            <div
              className={cn(
                "text-muted-foreground flex w-full items-center justify-center text-sm",
                CHART_HEIGHT.large,
              )}
            >
              Laden…
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
