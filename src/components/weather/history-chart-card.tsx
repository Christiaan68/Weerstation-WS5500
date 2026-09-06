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
import { getLocalDayBoundsUtc, todayLocalDateKey } from "@/lib/weather/timezone";

interface HistoryChartData {
  points: TimeSeriesPoint[];
  // De API (`/api/weather/history`) noemt dit veld `metrics`, niet `series`
  // — zie `HistoryResponseBody` in `src/lib/weather/history.ts`.
  metrics: TimeSeriesSeriesDef[];
  interval: AggregationInterval;
}

interface HistoryChartCardProps {
  stationSlug: string;
  /**
   * Eén of meer groepen metrics. Meerdere groepen = meerdere losse
   * mini-grafieken ÓNDER ELKAAR binnen deze ene kaart, met telkens hun eigen
   * Y-as-schaal — nodig zodra metrics sterk uiteenlopende eenheden/bereiken
   * hebben (bv. luchtvochtigheid 0-100% naast luchtdruk ~950-1050 hPa): op
   * één gedeelde as zou de ene lijn de andere onleesbaar plat drukken.
   * Alle groepen delen wél één API-aanroep/tijdvak (vandaag).
   */
  metricGroups: string[][];
  /** Bijschrift per groep — alleen getoond/nodig bij meer dan 1 groep. */
  groupLabels?: string[];
  title: string;
  description?: string;
  /** Ververs-interval; standaard gelijk aan het huidige pollinterval (5 minuten). */
  refreshIntervalMs?: number;
}

/**
 * Kaart met een tijdreeksgrafiek uit `/api/weather/history`, voor de huidige
 * lokale kalenderdag (00:00-24:00 Europe/Amsterdam, DST-bewust) — gebruikt op
 * het dashboard. Fase 4.3 verving hier de eerdere rollende 24-uursgrafiek
 * door deze kalenderdag-weergave. We sturen bewust expliciete `from`/`to`
 * i.p.v. een `period`-preset (zelfde aanpak als `/grafieken`'s
 * `ChartsExplorer`): `resolveHistoryRange()` (history.ts) geeft expliciete
 * from/to voorrang, dus dit werkt zonder wijzigingen aan de API. De grens
 * wordt bij elke (ververs)aanroep opnieuw berekend, dus rond middernacht
 * schuift de kaart vanzelf door naar de nieuwe dag bij de eerstvolgende
 * verversing.
 */
export function HistoryChartCard({
  stationSlug,
  metricGroups,
  groupLabels,
  title,
  description,
  refreshIntervalMs = 300_000,
}: HistoryChartCardProps) {
  const metricsKey = metricGroups.flat().join(",");
  const [data, setData] = useState<HistoryChartData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { startUtc, endUtc } = getLocalDayBoundsUtc(todayLocalDateKey());
        const url = `/api/weather/history?metrics=${encodeURIComponent(metricsKey)}&from=${encodeURIComponent(startUtc.toISOString())}&to=${encodeURIComponent(endUtc.toISOString())}&stationSlug=${encodeURIComponent(stationSlug)}`;
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
  }, [stationSlug, metricsKey, refreshIntervalMs]);

  const showGroupLabels = metricGroups.length > 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {data ? (
          metricGroups.map((group, index) => (
            <div key={group.join(",")}>
              {showGroupLabels && (
                <p className="text-muted-foreground mb-2 text-xs font-medium">
                  {groupLabels?.[index] ?? group.join(", ")}
                </p>
              )}
              <TimeSeriesChart
                points={data.points}
                series={data.metrics.filter((m) => group.includes(m.key))}
                interval={data.interval}
                heightPx={showGroupLabels ? 220 : 320}
              />
            </div>
          ))
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
