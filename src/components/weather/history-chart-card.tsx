"use client";

import { useEffect, useMemo, useState } from "react";

import { CHART_HEIGHT } from "@/components/charts/chart-sizing";
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
import { cn } from "@/lib/utils";
import type { AggregationInterval } from "@/lib/weather/downsampling";
import {
  addDaysToDateKey,
  formatLocalTime,
  getLocalDayBoundsUtc,
  todayLocalDateKey,
} from "@/lib/weather/timezone";

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
   * Tijdzone VAN DIT station (Fase 5) — bepaalt waar "vandaag" begint en
   * eindigt. Optioneel voor achterwaartse compatibiliteit; valt zonder deze
   * prop terug op de globale standaardtijdzone (`getLocalDayBoundsUtc()`'s
   * eigen default), exact het gedrag van vóór Fase 5.
   */
  timeZone?: string;
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
  /**
   * Aantal dagen terug t.o.v. vandaag (0 = vandaag, 1 = gisteren, ...) — zie
   * `dashboard-charts.tsx`, dat hier de dagnavigatie (terug/vooruit) voor
   * regelt. Optioneel, standaard vandaag, zodat andere aanroepers ongewijzigd
   * blijven werken.
   */
  dayOffset?: number;
  /**
   * Toont rechts in de kaartkop het tijdstip van de meest recente meting
   * binnen de getoonde dag — alleen relevant/gewenst op de eerste kaart
   * (Temperatuur), zodat direct duidelijk is tot hoe laat de getoonde dag
   * gegevens bevat (vooral nuttig bij het terugbladeren naar andere dagen).
   */
  showLatestMeasurementTime?: boolean;
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
  timeZone,
  metricGroups,
  groupLabels,
  title,
  description,
  refreshIntervalMs = 300_000,
  dayOffset = 0,
  showLatestMeasurementTime = false,
}: HistoryChartCardProps) {
  const metricsKey = metricGroups.flat().join(",");
  const [data, setData] = useState<HistoryChartData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const isToday = dayOffset === 0;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const dateKey = addDaysToDateKey(todayLocalDateKey(timeZone), -dayOffset);
        const { startUtc, endUtc } = getLocalDayBoundsUtc(dateKey, timeZone);
        const url = `/api/weather/history?metrics=${encodeURIComponent(metricsKey)}&from=${encodeURIComponent(startUtc.toISOString())}&to=${encodeURIComponent(endUtc.toISOString())}&station=${encodeURIComponent(stationSlug)}`;
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
    // Alleen doorlopend verversen voor vandaag — een afgelopen dag verandert
    // niet meer, dus periodiek herladen zou alleen onnodige verzoeken geven.
    if (!isToday) return;
    const intervalId = setInterval(load, refreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [stationSlug, timeZone, metricsKey, refreshIntervalMs, dayOffset, isToday]);

  const showGroupLabels = metricGroups.length > 1;

  // Tijdstip van het laatste (meest recente) datapunt binnen de getoonde dag
  // — puur informatief bij de Temperatuur-kaart, zie `showLatestMeasurementTime`.
  const latestMeasurementTimeLabel = useMemo(() => {
    if (!showLatestMeasurementTime || !data || data.points.length === 0) return null;
    const lastPoint = data.points[data.points.length - 1]!;
    return formatLocalTime(new Date(lastPoint.t), timeZone);
  }, [showLatestMeasurementTime, data, timeZone]);

  return (
    <Card>
      <CardHeader
        className={cn(
          latestMeasurementTimeLabel && "flex-row items-start justify-between space-y-0",
        )}
      >
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {latestMeasurementTimeLabel && (
          <span className="text-muted-foreground shrink-0 text-xs font-medium whitespace-nowrap">
            Meest recente meting: {latestMeasurementTimeLabel}
          </span>
        )}
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
                size={showGroupLabels ? "compact" : "default"}
              />
            </div>
          ))
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
