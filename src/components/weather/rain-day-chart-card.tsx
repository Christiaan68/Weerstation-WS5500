"use client";

import { useCallback } from "react";

import { RainRangeChartCard } from "@/components/weather/rain-range-chart-card";
import {
  addDaysToDateKey,
  getLocalDayBoundsUtc,
  todayLocalDateKey,
} from "@/lib/weather/timezone";

interface RainDayChartCardProps {
  stationSlug: string;
  /** Tijdzone van dit station — bepaalt waar de dag begint en eindigt. */
  timeZone?: string;
  /** Aantal dagen terug t.o.v. vandaag (0 = vandaag). Zie `dashboard-charts.tsx`. */
  dayOffset?: number;
  /** Ververs-interval voor de huidige dag; standaard gelijk aan het pollinterval (5 minuten). */
  refreshIntervalMs?: number;
}

/**
 * Dashboardkaart "Neerslag": de gecombineerde regengrafiek (cumulatieve regen
 * + regenintensiteit) voor één lokale kalenderdag, met de dagnavigatie van
 * het dashboard (`dayOffset`). De Regen-pagina gebruikt dezelfde grafiek
 * voor alle periodes via `RainExplorer`.
 */
export function RainDayChartCard({
  stationSlug,
  timeZone,
  dayOffset = 0,
  refreshIntervalMs,
}: RainDayChartCardProps) {
  const getRange = useCallback(() => {
    const dateKey = addDaysToDateKey(todayLocalDateKey(timeZone), -dayOffset);
    const { startUtc, endUtc } = getLocalDayBoundsUtc(dateKey, timeZone);
    return { from: startUtc, to: endUtc };
  }, [timeZone, dayOffset]);

  return (
    <RainRangeChartCard
      stationSlug={stationSlug}
      timeZone={timeZone}
      getRange={getRange}
      rangeKey={`day:${dayOffset}:${timeZone ?? ""}`}
      autoRefresh={dayOffset === 0}
      refreshIntervalMs={refreshIntervalMs}
      title="Neerslag"
      description="Cumulatieve regen van de dag (linkeras) naast de regenintensiteit (rechteras)."
      summaryLabel="Totaal deze dag"
    />
  );
}
